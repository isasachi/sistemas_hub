#!/usr/bin/env bash
#
# Daemon del scraper buscador-productos — corre 24/7 bajo systemd en el VPS.
# Reemplaza el cron de GitHub Actions. Cada ciclo:
#   1. Siembra la lista curada maestra (niches.txt) como pending — idempotente.
#   2. Drena la cola en BLOQUES frescos: llama pipeline.ts --all (proceso nuevo =
#      browser reseteado) hasta ver el centinela PH_QUEUE_EMPTY. Cada bloque
#      scrapea+analiza entrelazado + valida competencia PE de sus PH_NICHE_BATCH
#      nichos.
#   3. Cola de refinamiento, UNA vez por ciclo: expand-uncovered → analyze →
#      recheck-watchlist. (validate-pe YA NO va aquí: corre por-bloque dentro de
#      pipeline.ts.)
#   4. Duerme SLEEP_BETWEEN y repite. Con PH_REFRESH_DAYS=7 los activos reentran
#      a la cola cada semana → inventario fresco sostenido.
#
# Observabilidad: todo va por stdout/stderr a journald (systemd). Ver:
#   journalctl -u buscador-productos -f
#
# ⚠️ COSTO: Anthropic SOLO aquí (pipeline/analyze). Vercel solo lee de Supabase.
#
# Secretos: en apps/worker/.env.local (lo carga bootstrap.ts vía dotenv, que NO
# pisa vars ya presentes en process.env). Los PH_* de abajo se exportan acá.

set -uo pipefail

# ─── Configuración del daemon ────────────────────────────────────────────────
export PH_KEYWORD_ROTATION="${PH_KEYWORD_ROTATION:-1}"   # ventana rotativa siempre-on
export PH_KEYWORD_WINDOW="${PH_KEYWORD_WINDOW:-15}"      # clampeado a floor(pool/2) en resolve.ts
export PH_REFRESH_DAYS="${PH_REFRESH_DAYS:-7}"           # activos reentran a la cola cada 7 días
export PH_SEARCH_CAP="${PH_SEARCH_CAP:-500}"
export PH_ENRICH_LIMIT="${PH_ENRICH_LIMIT:-300}"
export PH_NICHE_BATCH="${PH_NICHE_BATCH:-15}"            # tamaño del bloque (= nichos por proceso fresco)

# ⚠️ CONCURRENCIA POR RAMPA. Lo "probado" del scraper live (20 pages) era perfil
# BURSTY (ráfagas de ~70s); el daemon es SOSTENIDO 24/7, que es lo que Meta
# bloquea por volumen/tiempo. Arrancar modesto (15) y subir hacia el objetivo 30
# SOLO mientras los GraphQL-vacíos sigan ~0 sobre horas (scrapeNiche loguea
# 0-payloads/DOM-fallbacks por corrida) y la RAM aguante (free -m). Si los vacíos
# trepan o hay OOM, bajar un escalón. Override sin redeploy: editar este export
# o pasar PH_CONCURRENCY en el environment del unit.
export PH_CONCURRENCY="${PH_CONCURRENCY:-15}"

LIST="${NICHES_FILE:-niches.txt}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-3600}"        # pausa entre ciclos cuando la cola se vacía
PIPELINE_TIMEOUT="${PIPELINE_TIMEOUT:-36000}" # tope por bloque (10h) — un browser colgado no es crash
STEP_TIMEOUT="${STEP_TIMEOUT:-7200}"          # tope por script de refinamiento (2h)
MAX_DRAIN_CHUNKS="${MAX_DRAIN_CHUNKS:-500}"   # backstop anti-loop por ciclo

log() { echo "[$(date '+%F %T')] $*"; }

# Drena la cola en bloques frescos hasta el centinela PH_QUEUE_EMPTY.
drain_queue() {
  local n=0 rc logf
  while [ "$n" -lt "$MAX_DRAIN_CHUNKS" ]; do
    n=$(( n + 1 ))
    log "── bloque $n: pipeline.ts --all (PH_NICHE_BATCH=$PH_NICHE_BATCH, conc=$PH_CONCURRENCY) ──"
    logf="$(mktemp)"
    # tee → stream live a journald Y guarda para detectar el centinela.
    timeout "$PIPELINE_TIMEOUT" npx tsx scripts/pipeline.ts --all 2>&1 | tee "$logf"
    rc=${PIPESTATUS[0]}
    if grep -q 'PH_QUEUE_EMPTY' "$logf"; then
      rm -f "$logf"
      log "cola vacía (PH_QUEUE_EMPTY) — drain completo en $n iteración(es)"
      return 0
    fi
    rm -f "$logf"
    if [ "$rc" -eq 124 ]; then
      log "bloque $n cortado por timeout (${PIPELINE_TIMEOUT}s) — proceso fresco retoma la cola"
    elif [ "$rc" -ne 0 ]; then
      log "bloque $n rc=$rc — pausa breve y reintento con proceso fresco"
      sleep 10
    fi
    # Descanso entre bloques (PH_BATCH_REST, default 0 = sin pausa) — pacing gentil
    # para que la IP "respire" entre batches. La cola-vacía retorna ANTES de esto.
    if [ "${PH_BATCH_REST:-0}" -gt 0 ]; then
      log "descanso entre bloques: ${PH_BATCH_REST}s"
      sleep "${PH_BATCH_REST}"
    fi
  done
  log "⚠ drain alcanzó MAX_DRAIN_CHUNKS=$MAX_DRAIN_CHUNKS — corto el ciclo (reintenta tras sleep)"
  return 1
}

# Un script de refinamiento, envuelto en timeout; errores logueados sin abortar.
refine_step() {
  log "refinamiento: $1"
  timeout "$STEP_TIMEOUT" npx tsx "scripts/$1" || log "⚠ $1 devolvió error/timeout (sigo)"
}

main() {
  cd "$(dirname "$0")/.."   # cwd = apps/worker (rutas scripts/… y niches.txt relativas)
  log "════ daemon buscador-productos arrancado ════"
  [ -f "$LIST" ] || log "⚠ no existe $LIST — sin lista curada; solo se procesarán pending de cold-start"

  while true; do
    log "──── ciclo: inicio ────"

    # 1. Sembrar la lista curada maestra (idempotente; salta existentes, no degrada active).
    if [ -f "$LIST" ]; then
      timeout "$STEP_TIMEOUT" npx tsx scripts/seed-niches.ts --from "$LIST" \
        || log "⚠ seed-niches devolvió error (sigo)"
    fi

    # 2. Drenar la cola en bloques frescos (scrape+analyze+validate-PE por bloque).
    drain_queue

    # 3. Cola de refinamiento, una vez por ciclo.
    refine_step expand-uncovered.ts
    refine_step analyze.ts
    # validate-pe como RED DE SEGURIDAD ($0 LLM): la validación PE principal corre
    # por-bloque dentro de pipeline.ts, pero expand-uncovered.ts crea productos en
    # nichos recién re-scrapeados (last_scraped fresco) que NO reentran a un bloque
    # por ~PH_REFRESH_DAYS días. Esta pasada les pone su escenario A/B/C/D en el
    # mismo ciclo; salta barato los nichos que el per-bloque ya validó.
    refine_step validate-pe.ts
    refine_step recheck-watchlist.ts

    log "──── ciclo: fin · durmiendo ${SLEEP_BETWEEN}s ────"
    sleep "$SLEEP_BETWEEN"
  done
}

# Solo corre el loop si se ejecuta directamente; al hacer `source` (tests) solo
# define las funciones (drain_queue, etc.).
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main
fi
