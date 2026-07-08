#!/usr/bin/env bash
#
# Guard de egress — se corre como ExecStartPre del daemon en el server IBM.
#
# El scraper sale SIN proxy: confía en que Tailscale enruta TODO el tráfico saliente
# por el exit node (la máquina de casa → IP residencial que Meta acepta). Si el túnel
# está caído, el egress sería la IP pública de la VM IBM (datacenter) → Meta la
# hard-bloquea de inmediato (mismo desastre que el proxy ISP, ver memoria). Este guard
# lo impide: falla el arranque si el egress es la IP prohibida o si curl no responde.
# Con Restart=always el service reintenta cada RestartSec hasta que el túnel suba.
#
# Uso:  require-egress.sh <ip-publica-de-la-VM-IBM>
#       require-egress.sh --self-test
#
# ponytail: solo chequea al ARRANCAR (cubre la carrera boot-antes-de-túnel, el caso
# real). Una caída del túnel a mitad de corrida la agarra el hard-abort P3 del
# rate-controller (Meta bloquea → cool-down). Agregar un check periódico solo si pica.
set -uo pipefail

# Pura y testeable: OK sii el egress existe y NO es la IP prohibida.
# $1=ip-prohibida  $2=ip-observada  → exit 0 OK, 1 fuga/curl-falló.
egress_ok() { [ -n "${2:-}" ] && [ "$2" != "$1" ]; }

if [ "${1:-}" = "--self-test" ]; then
  egress_ok 1.2.3.4 1.2.3.4 && { echo "FAIL: no detectó fuga (egress == prohibida)"; exit 1; }
  egress_ok 1.2.3.4 5.6.7.8 || { echo "FAIL: rechazó egress válido";              exit 1; }
  egress_ok 1.2.3.4 ""      && { echo "FAIL: aceptó egress vacío (curl falló)";   exit 1; }
  echo "self-test ok"; exit 0
fi

FORBIDDEN="${1:?falta la IP pública de la VM IBM como argumento}"
ACTUAL="$(curl -s --max-time 10 https://api.ipify.org || true)"

if egress_ok "$FORBIDDEN" "$ACTUAL"; then
  echo "egress OK: $ACTUAL (túnel activo, no es la IP de IBM $FORBIDDEN)"
  exit 0
fi
echo "🛑 egress = '${ACTUAL:-<sin respuesta>}' — túnel Tailscale caído o curl falló; NO arranco el scraper" >&2
exit 1
