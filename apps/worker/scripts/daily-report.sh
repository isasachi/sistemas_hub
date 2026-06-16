#!/usr/bin/env bash
#
# Reporte diario del daemon buscador-productos — junta el checklist de medición
# (throughput + blocks + RAM + cola) en un solo comando, para dimensionar los
# proxies (ver AGENTS.md, sección rate-control / breadth). Corre EN EL VPS.
#
# Uso:
#   bash scripts/daily-report.sh                 # últimas 24h
#   bash scripts/daily-report.sh today           # día de hoy
#   bash scripts/daily-report.sh "2 days ago"    # ventana custom (= --since de journalctl)
#
# Solo LEE (journalctl + una consulta read-only a la DB). No toca el daemon.

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT="buscador-productos"
SINCE="${1:-24 hours ago}"

LOG="$(journalctl -u "$UNIT" --since "$SINCE" --no-pager 2>/dev/null || true)"
if [ -z "$LOG" ]; then
  echo "Sin logs de $UNIT desde \"$SINCE\". ¿Corre el unit?  →  systemctl status $UNIT"
  exit 0
fi

# Helpers: contar líneas que matchean / sumar el nº embebido en líneas que matchean.
c()   { grep -cE "$1" <<<"$LOG" || true; }
suma(){ grep -oE "$1" <<<"$LOG" | grep -oE '[0-9]+' | awk '{s+=$1} END{print s+0}'; }

echo "═══════════════════════════════════════════════════════════"
echo " Daemon $UNIT · ventana: desde \"$SINCE\""
echo " $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "═══════════════════════════════════════════════════════════"

echo
echo "── THROUGHPUT (lo que crece el pool) ──"
printf '  %-34s %s\n' "Nichos completados (Pipeline OK):" "$(suma 'Pipeline: [0-9]+ nichos OK')"
printf '  %-34s %s\n' "Bloques corridos:"                 "$(c '── bloque [0-9]+:')"
printf '  %-34s %s\n' "Ciclos completos:"                 "$(c 'ciclo: fin')"
printf '  %-34s %s\n' "Nichos con productos:"             "$(c 'productos guardados para')"
printf '  %-34s %s\n' "Productos guardados (total):"      "$(suma '✓ [0-9]+ productos guardados')"
printf '  %-34s %s\n' "Nichos fallidos (✗):"              "$(c '✗ \[')"

echo
echo "── DEFENSAS ANTI-BLOCK (veces que dispararon = presión sobre la IP) ──"
printf '  %-34s %s\n' "⏸ cool-downs (P1):"                "$(c 'rate-control')"
printf '  %-34s %s\n' "⚠ runs block-comprometidos (P2):"  "$(c 'block-comprometido')"
printf '  %-34s %s\n' "⊘ PE inconcluso (P0):"             "$(c 'PE inconcluso')"

echo
echo "── SALUD DEL SCRAPE (vacías-tras-DOM ÷ búsquedas, por nicho) ──"
grep -oE 'búsquedas: [0-9]+.*vacías-tras-DOM: [0-9]+' <<<"$LOG" \
  | sed -E 's/.*búsquedas: ([0-9]+).*vacías-tras-DOM: ([0-9]+).*/\1 \2/' \
  | awk '{ b=$1; v=$2; if(b>0){ r=v/b; s+=r; n++; if(r>mx)mx=r; if(r>=0.6)hi++ } }
          END{ if(n>0) printf "  nichos medidos: %d · ratio vacías prom: %.0f%% · máx: %.0f%% · con ≥60%% (block): %d\n", n, s/n*100, mx*100, hi+0;
               else print "  (aún sin líneas de métricas en la ventana)" }'

echo
echo "── RAM ──"
free -m | awk '/^Mem:/{printf "  Mem:  %d/%d MB (%.0f%% usado)\n",$3,$2,$3/$2*100} /^Swap:/{printf "  Swap: %d/%d MB\n",$3,$2}'

echo
echo "── COLA / INVENTARIO (DB) ──"
if [ -f "$SCRIPT_DIR/../.env.local" ] && command -v npx >/dev/null 2>&1; then
  ( cd "$SCRIPT_DIR/.." && npx tsx scripts/queue-status.ts ) || true
else
  echo "  (sin apps/worker/.env.local o npx — se omite)"
fi

echo
echo "── CÓMO LEERLO (decide los proxies) ──"
echo "  • Nichos/día < ~24  → el refresh de 166/7d no alcanza → proxies."
echo "  • Cool-downs / comprometidos altos, o ratio vacías ≥60% frecuente"
echo "                      → IP saturada → proxies (o bajar PH_CONCURRENCY)."
echo "  • Pending sin bajar entre días → la cola se apila → proxies."
echo "  • Mem cerca del límite → KVM4 (solo junto con proxies)."
echo "═══════════════════════════════════════════════════════════"
