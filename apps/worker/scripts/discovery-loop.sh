#!/usr/bin/env bash
#
# Loop del MOTOR DE DESCUBRIMIENTO (`disc_*`). Corre bajo systemd, aparte del
# daemon de nichos del motor viejo.
#
#   journalctl -u discovery-engine -f
#
# Un ciclo:
#   1. scheduler  — rescata jobs trabados, refresca el yield, poda y encola
#                   (60% descubrimiento por bandit / 40% recrawl por tier)
#   2. run-jobs   — drena `discover`, después `audit`
#   3. analyze    — landings y productos del backlog global (NO toca Meta)
#   4. run-jobs   — drena `rank` (cada descubrimiento encola el suyo): perfila
#                   anunciantes y escribe `disc_ranked`, que es lo que ve la UI
#   5. vocab      — extrae vocabulario nuevo de lo que se acaba de auditar
#
# ⚠️ EL ORDEN IMPORTA: `rank` corre DESPUÉS de `analyze` porque solo mira
# anuncios que ya pasaron las fases 5-6. Invertirlo deja el ranking sin
# candidatos y el ciclo termina sin producir un producto.
#
# ⚠️ SIN LLM EN NINGÚN PASO. Es la restricción dura del CONTEXT §4.1.
#
# ⚠️ COMPARTE LA IP CON `buscador-productos.service` (el daemon del motor viejo).
# El rate-controller del scraper es un singleton POR PROCESO, así que los dos NO
# se ven entre sí. Con los dos corriendo, bajá DISC_CAPACIDAD antes de subir la
# concurrencia: medido, ~11 lecturas de catálogo seguidas bastan para que Meta
# empiece a devolver payloads sin nodos.

set -uo pipefail

# Bajo systemd el PATH es mínimo (node/npx vía nvm).
if ! command -v npx >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi

cd "$(dirname "$0")/.." || exit 1

export PH_BLOCK_MEDIA="${PH_BLOCK_MEDIA:-1}"

CAPACIDAD="${DISC_CAPACIDAD:-12}"
# Jobs que se drenan por ciclo. Menor que la capacidad a propósito: la cola es
# un colchón, y que sobren jobs pendientes es lo que permite bajar el ritmo sin
# perder trabajo ya decidido.
MAX_DISCOVER="${DISC_MAX_DISCOVER:-4}"
MAX_AUDIT="${DISC_MAX_AUDIT:-4}"
# El ranking es el paso MÁS CARO contra Meta: dos navegaciones por anunciante y
# ~100 anunciantes por corrida. `storedProfiles` reusa los ya medidos, así que el
# costo real baja mucho al repetirse, pero el primer ranking de un nicho nuevo es
# el que puede calentar la IP.
MAX_RANK="${DISC_MAX_RANK:-1}"
# Descanso entre ciclos. Es la perilla principal contra el bloqueo de Meta.
SLEEP_SECONDS="${DISC_SLEEP:-300}"
# Descanso largo cuando Meta bloqueó. Re-sondear enseguida escala el soft-block
# a hard-block — el motor viejo ya lo pagó (2026-06-18, 70+ min sondeando una IP
# muerta).
BLOCK_SLEEP="${DISC_BLOCK_SLEEP:-3600}"
STEP_TIMEOUT="${DISC_STEP_TIMEOUT:-1800}"
# Anuncios que `analyze` procesa por ciclo.
#
# ⚠️ ESTE NÚMERO TIENE QUE IR POR DELANTE DEL DESCUBRIMIENTO, y con 400 no iba.
# Los nichos consolidados traen 1.000-2.300 anuncios por job y el ciclo corre dos
# jobs: medido, la cola de análisis pasó de 3.000 a 11.000 en tres horas y la
# salida de productos cayó de ~25/h a 3/h — el ranking se aplazaba porque sus
# anuncios nunca llegaban a analizarse.
#
# Subirlo es barato: `analyze` NO toca Meta (pide landings a tiendas de terceros,
# con su propio pool) y su concurrencia es fija en 8, así que un lote más grande
# alarga el paso, no lo hace más pesado. Medido: 400 anuncios tardan 36-39 s
# contra un tope de paso de 1.800 s.
ANALYZE_LIMIT="${DISC_ANALYZE_LIMIT:-2000}"

log() { echo "[$(date '+%F %T')] $*"; }

paso() {
  local nombre="$1"; shift
  log "── $nombre"
  timeout "$STEP_TIMEOUT" "$@"
  local code=$?
  [ $code -ne 0 ] && log "   $nombre salió con código $code"
  return $code
}

log "discovery-loop arranca · capacidad $CAPACIDAD · ciclo ${SLEEP_SECONDS}s"

while true; do
  BLOQUEADO=0

  paso "scheduler" npx tsx src/cli/scheduler.ts --capacidad "$CAPACIDAD"

  # La salida se inspecciona para detectar el bloqueo: `run-jobs` devuelve el
  # job a la cola con backoff, pero el loop tiene que dejar de tocar la IP.
  SALIDA_DISCOVER=$(timeout "$STEP_TIMEOUT" npx tsx src/cli/run-jobs.ts --kind discover --max "$MAX_DISCOVER" 2>&1)
  echo "$SALIDA_DISCOVER"
  echo "$SALIDA_DISCOVER" | grep -q "PH_PERSISTENT_BLOCK" && BLOQUEADO=1

  if [ "$BLOQUEADO" -eq 0 ]; then
    SALIDA_AUDIT=$(timeout "$STEP_TIMEOUT" npx tsx src/cli/run-jobs.ts --kind audit --max "$MAX_AUDIT" 2>&1)
    echo "$SALIDA_AUDIT"
    echo "$SALIDA_AUDIT" | grep -q "PH_PERSISTENT_BLOCK" && BLOQUEADO=1
  fi

  # `analyze` NO toca Meta: pide landings de tiendas de terceros, con su propio
  # pool y sus propios límites. Por eso corre incluso con la IP bloqueada — es
  # justo el trabajo que se puede adelantar mientras Meta descansa.
  paso "analyze" npx tsx src/cli/analyze.ts --limit "$ANALYZE_LIMIT"

  # `rank` SÍ toca Meta (dos navegaciones por anunciante NUEVO; los ya medidos
  # salen de `disc_advertisers` sin navegar), así que se salta si hubo bloqueo.

  # MAX_RANK=0 salta el paso entero. Hace falta explícito porque `run-jobs`
  # acota `--max` a 1 como mínimo: pasarle 0 correría un ranking igual.
  if [ "$BLOQUEADO" -eq 0 ] && [ "$MAX_RANK" -gt 0 ]; then
    SALIDA_RANK=$(timeout "$STEP_TIMEOUT" npx tsx src/cli/run-jobs.ts --kind rank --max "$MAX_RANK" 2>&1)
    echo "$SALIDA_RANK"
    echo "$SALIDA_RANK" | grep -q "PH_PERSISTENT_BLOCK" && BLOQUEADO=1
  fi

  paso "vocab" npx tsx src/cli/vocab.ts --extract --idf

  if [ "$BLOQUEADO" -eq 1 ]; then
    log "⚠ Meta bloqueó — durmiendo ${BLOCK_SLEEP}s para que la IP respire"
    sleep "$BLOCK_SLEEP"
  else
    log "ciclo listo · durmiendo ${SLEEP_SECONDS}s"
    sleep "$SLEEP_SECONDS"
  fi
done
