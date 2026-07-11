#!/usr/bin/env bash
#
# Poller del research por URL (feature "pega un anuncio"). Corre bajo systemd,
# aparte del daemon de nichos. Cada ~POLL_SECONDS invoca research-url.ts, que
# drena la cola ph_url_research (o sale rápido si está vacía, sin lanzar browser).
# Proceso fresco por tanda = browser reseteado, igual filosofía que pipeline.ts.
#
#   journalctl -u url-research -f
#
# ⚠️ COSTO: Anthropic solo en research-url.ts (una llamada por request; la cuota
# 3/día del usuario la acota).
#
# ⚠️ IP compartida con el daemon de nichos (misma salida Tailscale, sin proxy). El
# rate-controller del scraper es un singleton POR PROCESO, así que este poller NO
# ve el cool-down del daemon ni viceversa. Mitigación v1: la cuota 3/día + pocas
# navegaciones por request mantienen el volumen bursty (perfil que Meta tolera).
# ponytail: si aparecen bloqueos, coordinar por un flag en DB (ph_ip_blocked_until)
# que ambos procesos consulten — no antes.

set -uo pipefail

# Bajo systemd el PATH es mínimo (node/npx vía nvm). Cargar nvm si falta npx.
if ! command -v npx >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi

# Egress vía Tailscale (mismo que el daemon). Media-block ON para gastar menos RAM.
export PH_BLOCK_MEDIA="${PH_BLOCK_MEDIA:-1}"

POLL_SECONDS="${URL_RESEARCH_POLL:-4}"      # cada cuánto revisar la cola
STEP_TIMEOUT="${URL_RESEARCH_TIMEOUT:-600}" # tope por tanda (10 min — un browser colgado no cuelga el loop)

log() { echo "[$(date '+%F %T')] $*"; }

main() {
  cd "$(dirname "$0")/.."   # cwd = apps/worker (rutas scripts/… y lib/prompts/… relativas)
  log "════ poller url-research arrancado (cada ${POLL_SECONDS}s) ════"
  while true; do
    timeout "$STEP_TIMEOUT" npx tsx scripts/research-url.ts || log "⚠ research-url devolvió error/timeout (sigo)"
    sleep "$POLL_SECONDS"
  done
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main
fi
