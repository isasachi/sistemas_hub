#!/usr/bin/env bash
#
# Sprint de carga de inventario — buscador-productos.
# Siembra niches.txt y lo drena en batches de ~BATCH_SIZE nichos (scrape+analyze
# entrelazado vía pipeline.ts), un batch tras otro. Al final corre la cola de
# refinamiento (expand → analyze → validate-pe → recheck) UNA sola vez.
#
# Por qué en batches: cada pipeline corre en un proceso FRESCO, evitando la
# degradación del browser que vimos tras ~9h continuas (los últimos nichos de un
# run largo no crecían). Batches de ~8.5h = fiabilidad + medición.
#
# Uso:
#   bash scripts/run-sprint.sh                 # corre el sprint completo
#   DRY_RUN=1 bash scripts/run-sprint.sh       # solo imprime el plan, no ejecuta
#   BATCH_SIZE=20 bash scripts/run-sprint.sh   # override del tamaño de batch
#
# Recomendado correrlo en background y loguear:
#   bash scripts/run-sprint.sh > /tmp/sprint.log 2>&1 &
#
# ⚠️ Requisitos: saldo de Anthropic cargado (el analyze usa Batches/Haiku). Esta
# es la herramienta MANUAL de carga inicial; en producción el daemon
# (worker-loop.sh + systemd) drena la cola 24/7. No correr ambos a la vez sobre la
# misma IP. Concurrencia: ver la nota de rampa en AGENTS.md (el viejo "no subir de
# 3" era del runner residencial; el VPS sube por rampa hacia 30 vigilando vacíos).

set -uo pipefail
cd "$(dirname "$0")/.."

# Caps agresivos del plan 13 para maximizar inventario.
export PH_SEARCH_CAP="${PH_SEARCH_CAP:-500}"
export PH_ENRICH_LIMIT="${PH_ENRICH_LIMIT:-300}"
export PH_CONCURRENCY="${PH_CONCURRENCY:-3}"

BATCH_SIZE="${BATCH_SIZE:-22}"
LIST="${1:-niches.txt}"
DRY_RUN="${DRY_RUN:-0}"

[ -f "$LIST" ] || { echo "✗ No existe $LIST"; exit 1; }

# Lee la lista ignorando vacíos y comentarios (#).
mapfile -t NICHES < <(grep -vE '^[[:space:]]*(#|$)' "$LIST")
total=${#NICHES[@]}
[ "$total" -gt 0 ] || { echo "✗ $LIST no tiene nichos"; exit 1; }
batches=$(( (total + BATCH_SIZE - 1) / BATCH_SIZE ))

echo "════════════════════════════════════════════════════════"
echo " SPRINT · $total nichos · $batches batches de $BATCH_SIZE"
echo " caps: SEARCH=$PH_SEARCH_CAP ENRICH=$PH_ENRICH_LIMIT CONC=$PH_CONCURRENCY"
echo " inicio: $(date '+%F %T')   DRY_RUN=$DRY_RUN"
echo "════════════════════════════════════════════════════════"

run() {  # ejecuta o, en dry-run, solo imprime
  if [ "$DRY_RUN" = "1" ]; then echo "    [dry] $*"; else "$@"; fi
}

i=0; b=1
while [ "$i" -lt "$total" ]; do
  chunk=("${NICHES[@]:i:BATCH_SIZE}")
  tmp="$(mktemp)"
  printf '%s\n' "${chunk[@]}" > "$tmp"

  echo ""
  echo "──── BATCH $b/$batches · ${#chunk[@]} nichos · $(date '+%F %T') ────"
  printf '   %s\n' "${chunk[@]}"

  run npx tsx scripts/seed-niches.ts --from "$tmp" \
    || echo "   ⚠ seed batch $b devolvió error (sigo)"
  run npx tsx scripts/pipeline.ts --all \
    || echo "   ⚠ pipeline batch $b devolvió error (sigo al próximo batch)"

  rm -f "$tmp"
  i=$(( i + BATCH_SIZE )); b=$(( b + 1 ))
done

echo ""
echo "──── FASE FINAL: refinamiento · $(date '+%F %T') ────"
run npx tsx scripts/expand-uncovered.ts || echo "   ⚠ expand-uncovered error (sigo)"
run npx tsx scripts/analyze.ts          || echo "   ⚠ analyze error (sigo)"
run npx tsx scripts/validate-pe.ts      || echo "   ⚠ validate-pe error (sigo)"
run npx tsx scripts/recheck-watchlist.ts || echo "   ⚠ recheck-watchlist error (sigo)"

echo ""
echo "════════════════════════════════════════════════════════"
echo " SPRINT DONE · $(date '+%F %T')"
echo "════════════════════════════════════════════════════════"
