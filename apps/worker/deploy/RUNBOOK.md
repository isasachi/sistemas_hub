# Runbook — deploy del daemon `buscador-productos` (KVM2 + proxy ISP)

Arquitectura: el daemon corre 24/7 bajo systemd en el VPS, sale a Meta por **un
proxy ISP/residencial** (las IPs de datacenter las bloquea Meta), escribe a
Supabase. Vercel solo lee. Anthropic SOLO acá.

**Specs objetivo:** Hostinger KVM2 (2 vCPU · 8 GB RAM) + 1 proxy ISP unlimited
(Proxy-Seller/Windstream, validado) + media-blocking. Cuello de botella = CPU.

---

## 0. Prerrequisitos

- [ ] VPS Ubuntu/Debian con acceso `ssh` y `sudo`.
- [ ] 1 proxy ISP **unlimited** (no datacenter, no metered). Credenciales a mano.
- [ ] Migraciones de Supabase ya aplicadas (`supabase/migrations/`).
- [ ] `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## 1. Preparar el server (una vez)

```bash
# Node 20+ (nvm o nodesource). Verificar:
node -v        # >= 20

# Clonar el repo (ajustar path/usuario; el unit asume /home/<user>/chamba/sistemas_hub)
git clone https://github.com/isasachi/sistemas_hub.git ~/chamba/sistemas_hub
cd ~/chamba/sistemas_hub
git checkout revert-batch-arch

# Instalar deps (raíz del monorepo) + Chromium con libs del sistema
npm ci
npx playwright install --with-deps chromium
```

## 2. Secretos (NO en git, NO en el .service)

```bash
cd ~/chamba/sistemas_hub/apps/worker
cat > .env.local <<'ENV'
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-...
PH_PROXY=host:port:user:pass
ENV
chmod 600 .env.local
```

`PH_PROXY` acepta `host:port:user:pass` **o** `http://user:pass@host:port`.
`bootstrap.ts` carga `.env.local` vía dotenv (no pisa vars ya presentes).

## 3. Pre-flight — validar el proxy DESDE el VPS (crítico)

Antes de arrancar el daemon, confirmá que el VPS + proxy traen nodos de Meta:

```bash
cd ~/chamba/sistemas_hub/apps/worker
PH_PROXY="$(grep -E '^PH_PROXY=' .env.local | cut -d= -f2-)" \
  PH_CONCURRENCY=8 npx tsx scripts/validate-proxy.ts --stress
```

- 🟢 `VIABLE` + Fases 1/2 con `✓ nodos` → seguir.
- 🔴 `BLOQUEADO` → el proxy no sirve desde esta IP/red; NO arranques el daemon.
- Revisá el ASN en Fase 0: ISP real (Windstream/AT&T/Cogent…) ✓, hosting (OVH/
  Hetzner/DigitalOcean…) ✗.

## 4. Instalar y arrancar el daemon

```bash
cd ~/chamba/sistemas_hub
# Ajustar User= y WorkingDirectory= si el clon NO está en /home/isasachi/...
sudo cp apps/worker/deploy/buscador-productos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now buscador-productos
```

## 5. Verificar que arrancó sano

```bash
systemctl status buscador-productos --no-pager
journalctl -u buscador-productos -f
```

Buscá en el log, en orden:
1. `════ daemon buscador-productos arrancado ════`
2. `✓ N nichos procesados` (seed de niches.txt)
3. `── bloque 1: pipeline.ts --all (PH_NICHE_BATCH=10, conc=10) ──`
4. **`[scraper] proxy: http://… · media-block: on · conc: 10`** ← confirma proxy+blocking
5. `[país] "keyword" → N páginas (M nodos)` con **M > 0** ← IP sana

🚩 Si ves `media-block: on · conc: …` pero `proxy: ⚠ NINGUNO` → `PH_PROXY` no se
cargó (revisá `.env.local`). **Pará el daemon** — está saliendo por la IP directa.

## 6. Soak — las primeras 2-4 h (no desatender aún)

En paralelo al `journalctl -f`:

```bash
top            # load average: querés < ~1.8 sostenido (2 vCPU). Si se clava 2.0+ con cola → bajar conc.
free -m        # disp: que no caiga a ~0 (OOM). A conc 10 con media-block debería sobrar.
```

Señales de problema en el log:
- `⏸ rate-control` repetido / `0 nodos` trepando → el proxy/IP no aguanta la tasa.
- Bloque que nunca cierra / latencias de nav que se estiran → CPU encolando.

Si todo limpio tras unas horas → conc 10 es tu base estable.

## 7. Ajustes SIN redeploy

Los `PH_*` se exportan en `worker-loop.sh` con `${VAR:-default}`, así que un
`Environment=` en el unit los pisa. Para cambiar conc sin tocar git:

```bash
sudo systemctl edit buscador-productos
# añadir:  [Service]
#          Environment=PH_CONCURRENCY=12
sudo systemctl restart buscador-productos
```

(O editar el export en `worker-loop.sh` y `git pull` + restart.)

**Rampa a 12→15:** solo si el soak a 10 quedó limpio (load avg holgado, cooldowns
~0). Subir de a un escalón y re-observar 1-2 h cada vez. Sin rampa por defecto.

## 8. Operaciones comunes

```bash
sudo systemctl stop buscador-productos       # parar
sudo systemctl restart buscador-productos    # reiniciar (tras git pull)
journalctl -u buscador-productos -f          # logs en vivo
journalctl -u buscador-productos --since '1 hour ago' | grep -E 'nodos|⏸|✗'

# Actualizar código:
cd ~/chamba/sistemas_hub && git pull && npm ci && sudo systemctl restart buscador-productos

# Estado de la cola/inventario (solo lee Supabase, $0):
cd apps/worker && npx tsx scripts/queue-status.ts
```

## 9. Rollback / troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| `proxy: ⚠ NINGUNO` en el log | `.env.local` no tiene `PH_PROXY` o no se cargó | parar, arreglar `.env.local`, restart |
| Muchos `0 nodos` / `⏸ rate-control` | proxy bloqueado o tasa muy alta | `validate-proxy.ts` para confirmar; bajar conc; cambiar IP |
| OOM / `free -m` ~0 | conc muy alta para 8 GB | bajar `PH_CONCURRENCY` (Environment override) + restart |
| load avg clavado en 2.0+ | CPU saturado (2 vCPU) | bajar conc a 8; o subir a KVM4 (4 vCPU) |
| Daemon no arranca | path/user del unit no coincide | editar `WorkingDirectory=`/`User=` en el `.service` |

**Regla de oro de costos:** Anthropic corre SOLO en este daemon. Si algo sugiere
LLM en el path de request de Vercel, está mal — revisar antes de seguir.
