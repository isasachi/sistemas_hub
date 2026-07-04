#!/usr/bin/env bash
#
# Daemon del scraper buscador-productos — corre bajo systemd en bloques de trabajo
# de WORK_WINDOW (5h) seguidos de REST (1h) de descanso, en ciclo (ya no 24/7).
# Reemplaza el cron de GitHub Actions. Cada ciclo dentro de la ventana de trabajo:
#   1. Siembra la lista curada maestra (niches.txt) como pending — idempotente.
#   2. Drena la cola en BLOQUES frescos: llama pipeline.ts --all (proceso nuevo =
#      browser reseteado) hasta ver el centinela PH_QUEUE_EMPTY. Cada bloque
#      scrapea+analiza entrelazado + valida competencia PE de sus PH_NICHE_BATCH
#      nichos.
#   3. Cola de refinamiento, UNA vez por ciclo: expand-uncovered → analyze →
#      recheck-watchlist. (validate-pe YA NO va aquí: corre por-bloque dentro de
#      pipeline.ts.)
#   4. Duerme SLEEP_BETWEEN y repite hasta cumplir WORK_WINDOW (5h); entonces
#      descansa REST (1h) antes del próximo bloque. Con PH_REFRESH_DAYS=7 los activos
#      reentran a la cola cada semana → inventario fresco sostenido.
#
# Observabilidad: todo va por stdout/stderr a journald (systemd). Ver:
#   journalctl -u buscador-productos -f
#
# ⚠️ COSTO: Anthropic SOLO aquí (pipeline/analyze). Vercel solo lee de Supabase.
#
# Secretos: en apps/worker/.env.local (lo carga bootstrap.ts vía dotenv, que NO
# pisa vars ya presentes en process.env). Los PH_* de abajo se exportan acá.

set -uo pipefail

# Bajo systemd el PATH es mínimo y no trae node/npx (instalado vía nvm). Si falta,
# carga nvm para resolver npx/tsx. Inofensivo cuando ya están en PATH (nohup/VPS).
if ! command -v npx >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi

# ─── Configuración del daemon ────────────────────────────────────────────────
# ⚠️ El scraper DEBE salir por un proxy ISP/residencial: PH_PROXY se setea en
# .env.local (NO acá — es secreto). Sin él, Meta bloquea la IP del VPS.
export PH_BLOCK_MEDIA="${PH_BLOCK_MEDIA:-1}"             # aborta imágenes/video/fuentes (CDP) → menos RAM/CPU por page
export PH_KEYWORD_ROTATION="${PH_KEYWORD_ROTATION:-1}"   # ventana rotativa siempre-on
export PH_KEYWORD_WINDOW="${PH_KEYWORD_WINDOW:-15}"      # clampeado a floor(pool/2) en resolve.ts
export PH_REFRESH_DAYS="${PH_REFRESH_DAYS:-7}"           # activos reentran a la cola cada 7 días
export PH_SEARCH_CAP="${PH_SEARCH_CAP:-300}"             # corta discovery (cards, $0 RAM)
export PH_ENRICH_LIMIT="${PH_ENRICH_LIMIT:-250}"         # top-K discovery a enriquecer (por señal de card)
export PH_ANALYZE_LIMIT="${PH_ANALYZE_LIMIT:-250}"       # productos analizados por nicho/run (batch plano = mismo costo, más rápido el drenado)
export PH_NICHE_BATCH="${PH_NICHE_BATCH:-10}"            # bloque = nichos por proceso fresco (menor = menos leak de RAM)
export PH_BATCH_REST="${PH_BATCH_REST:-60}"             # respiro entre bloques para reclamar RAM

# CONCURRENCIA — scraping LOCAL por IP residencial nativa (sin proxy; el proxy
# ISP del VPS fue hard-bloqueado por Meta el 2026-06-18, ver memoria). La IP
# residencial nativa aguantó conc 15 × 13.5h sin bloqueo; arrancamos conservador
# en 5 (es la conexión de casa — un block aquí afecta el internet real). El
# hard-abort del rate-controller corta el sondeo si Meta llegara a throttlear.
# Override: editar este export o pasar PH_CONCURRENCY en el environment.
export PH_CONCURRENCY="${PH_CONCURRENCY:-5}"

LIST="${NICHES_FILE:-niches.txt}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-3600}"        # pausa entre ciclos cuando la cola se vacía
WORK_WINDOW="${PH_WORK_WINDOW:-18000}"        # ventana de trabajo por bloque (5h) — luego descansa
REST="${PH_REST:-3600}"                       # descanso entre bloques (1h)
BLOCK_COOLDOWN="${PH_BLOCK_COOLDOWN:-3600}"   # enfriamiento largo tras un block persistente (hard-abort)
PIPELINE_TIMEOUT="${PIPELINE_TIMEOUT:-36000}" # tope por bloque (10h) — un browser colgado no es crash
STEP_TIMEOUT="${STEP_TIMEOUT:-7200}"          # tope por script de refinamiento (2h)
MAX_DRAIN_CHUNKS="${MAX_DRAIN_CHUNKS:-500}"   # backstop anti-loop por ciclo

log() { echo "[$(date '+%F %T')] $*"; }

# Drena la cola en bloques frescos hasta el centinela PH_QUEUE_EMPTY.
# Retorna: 0 = cola vacía/drenada · 1 = tope de chunks · 2 = block persistente
# (hard-abort: la IP está muerta; main() salta el refinamiento y enfría largo).
drain_queue() {
  local n=0 rc logf
  while [ "$n" -lt "$MAX_DRAIN_CHUNKS" ]; do
    n=$(( n + 1 ))
    log "── bloque $n: pipeline.ts --all (PH_NICHE_BATCH=$PH_NICHE_BATCH, conc=$PH_CONCURRENCY) ──"
    logf="$(mktemp)"
    # tee → stream live a journald Y guarda para detectar el centinela.
    timeout "$PIPELINE_TIMEOUT" npx tsx scripts/pipeline.ts --all 2>&1 | tee "$logf"
    rc=${PIPESTATUS[0]}
    # Hard-abort: re-lanzar otro bloque solo re-sondearía la IP muerta. Cortamos
    # el drain y dejamos que main() enfríe largo (BLOCK_COOLDOWN).
    if grep -q 'PH_PERSISTENT_BLOCK' "$logf"; then
      rm -f "$logf"
      log "🛑 block PERSISTENTE (PH_PERSISTENT_BLOCK) — corto el drain; el ciclo enfriará largo"
      return 2
    fi
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
    # Bloque de trabajo: cicla seed→drain→refine hasta agotar WORK_WINDOW (5h),
    # luego descansa REST (1h). $SECONDS es el reloj del shell (builtin, $0 deps).
    work_start=$SECONDS
    while [ $(( SECONDS - work_start )) -lt "$WORK_WINDOW" ]; do
      log "──── ciclo: inicio (ventana ${WORK_WINDOW}s · transcurrido $(( SECONDS - work_start ))s) ────"

      # 1. Sembrar la lista curada maestra (idempotente; salta existentes, no degrada active).
      if [ -f "$LIST" ]; then
        timeout "$STEP_TIMEOUT" npx tsx scripts/seed-niches.ts --from "$LIST" \
          || log "⚠ seed-niches devolvió error (sigo)"
      fi

      # 2. Drenar la cola en bloques frescos (scrape+analyze+validate-PE por bloque).
      drain_queue
      drain_rc=$?

      # Hard-abort: block persistente → la IP está muerta. Saltamos el refinamiento
      # (expand/analyze/validate-pe/recheck también scrapean = re-sondearían) y
      # enfriamos largo antes de reintentar. Si la IP no se recupera, el próximo
      # ciclo vuelve a abortar barato (tope PH_MAX_COOLDOWNS) y re-enfría.
      if [ "$drain_rc" -eq 2 ]; then
        log "──── ciclo: ABORTADO por block persistente · enfriando ${BLOCK_COOLDOWN}s ────"
        sleep "$BLOCK_COOLDOWN"
        continue
      fi

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

    log "──── ventana de trabajo cumplida (~${WORK_WINDOW}s) · descanso ${REST}s ────"
    sleep "$REST"
  done
}

# Solo corre el loop si se ejecuta directamente; al hacer `source` (tests) solo
# define las funciones (drain_queue, etc.).
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main
fi
