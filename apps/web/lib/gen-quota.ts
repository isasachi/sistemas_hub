/**
 * Rate-limit de las rutas que llaman Gemini (la generación es la llamada cara).
 * Sin esto, los endpoints de generación (app/api/.../route.ts) que generan
 * imágenes/texto eran world-callable sin tope → un curl en loop = gasto LLM ilimitado.
 *
 * Dos capas (1 fila en ph_gen_usage por generación, keyed por session_id + kind):
 *   PER-STEP (solo imagen) — 1 gen libre + 3 regens por (sesión, step). UX visible
 *     vía regensLeft; el step es `kind`, la instancia de tool es `session_id`.
 *   GLOBAL diario (día America/Lima, reusa limaSearchDay) — backstop de costo
 *     anti-abuso: cuenta imagen + texto; un atacante con sesiones infinitas choca aquí.
 *   Texto: regens ilimitadas (no toca el pool de 3) pero sí cuenta al backstop global.
 *
 * checkGenQuota lee y decide ANTES de generar; recordGenQuota inserta DESPUÉS de un
 * éxito (un fallo no quema una regen). Tabla: ph_gen_usage —
 * migraciones 20260622000001_ph_gen_usage.sql + 20260626000002_ph_gen_usage_session.sql.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { limaSearchDay } from './product-hunter/quota'

let _db: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return _db
}

export const GEN_GLOBAL_DAILY_LIMIT = Number(process.env.GEN_GLOBAL_DAILY_LIMIT ?? 500)
export const GEN_PER_STEP_LIMIT = Number(process.env.GEN_PER_STEP_LIMIT ?? 4) // 1 libre + 3 regens

// Steps de imagen (los caros). Match por prefijo: landing-section incluye `:${type}`.
export const IMAGE_KINDS = ['branding-identidad', 'branding-logo', 'branding-etiqueta', 'branding-mockup', 'anuncios-image', 'landing-section', 'video-character', 'video-render']
export function isImageKind(kind: string): boolean {
  return IMAGE_KINDS.some((k) => kind === k || kind.startsWith(k + ':'))
}

// El render de video (Grok vía KIE) cuesta un orden de magnitud más que una imagen,
// así que tiene su propio tope: 1 generación + 2 regens, en vez del 1+3 general.
export const VIDEO_RENDER_LIMIT = Number(process.env.GEN_VIDEO_LIMIT ?? 3)
function limitFor(kind: string): number {
  return kind === 'video-render' ? VIDEO_RENDER_LIMIT : GEN_PER_STEP_LIMIT
}

// regens restantes DESPUÉS de la gen nº `count+1` para un step con `count` filas previas.
export function regensLeftFor(count: number, kind = ''): number {
  return Math.max(0, limitFor(kind) - Math.max(1, count))
}

/**
 * Lee los contadores y decide ANTES de generar. NO inserta nada.
 * - blocked: un Response 429 listo (texto en español) o null si puede proceder.
 * - regensLeft: regens que quedarán tras esta gen (imagen) o null (texto = ilimitado).
 *
 * ponytail: count-then-insert no atómico → bajo ráfaga el tope puede pasarse por
 * ~concurrencia filas. Aceptable para un backstop de costo. ponytail: fail-open ante
 * error DB (igual que el resto del hub): con DB caída no bloqueamos.
 */
export async function checkGenQuota(
  sessionId: string | null,
  kind: string,
): Promise<{ blocked: Response | null; regensLeft: number | null }> {
  const db = getDb()
  const day = limaSearchDay()

  // 1. Backstop global diario (cuenta imagen + texto).
  const { count: globalCount, error: gErr } = await db
    .from('ph_gen_usage').select('*', { count: 'exact', head: true }).eq('gen_day', day)
  if (gErr) { console.error('[gen-quota] global:', gErr.message); return { blocked: null, regensLeft: null } }
  if ((globalCount ?? 0) >= GEN_GLOBAL_DAILY_LIMIT) {
    return { blocked: Response.json({ error: 'El servicio alcanzó su límite diario de generaciones. Vuelve mañana.' }, { status: 429 }), regensLeft: null }
  }

  // 2. Texto: sin tope per-step.
  if (!isImageKind(kind) || !sessionId) return { blocked: null, regensLeft: null }

  // 3. Per-step (imagen): count(session_id, kind).
  const { count: stepCount, error: sErr } = await db
    .from('ph_gen_usage').select('*', { count: 'exact', head: true }).eq('session_id', sessionId).eq('kind', kind)
  if (sErr) { console.error('[gen-quota] step:', sErr.message); return { blocked: null, regensLeft: null } }
  const used = stepCount ?? 0
  const limit = limitFor(kind)
  if (used >= limit) {
    return { blocked: Response.json({ error: `Llegaste al límite de ${limit - 1} regeneraciones para este paso.` }, { status: 429 }), regensLeft: 0 }
  }
  return { blocked: null, regensLeft: regensLeftFor(used + 1, kind) }
}

/** Registra una generación exitosa (1 fila). Llamar SOLO tras generar OK.
 * NUNCA lanza: envuelve en try/catch para proteger al caller (la generación ya fue exitosa).
 */
export async function recordGenQuota(sessionId: string | null, kind: string, userId: string | null): Promise<void> {
  try {
    const { error } = await getDb().from('ph_gen_usage').insert({ user_id: userId, kind, gen_day: limaSearchDay(), session_id: sessionId })
    if (error) console.error('[gen-quota] registrando:', error.message)
  } catch (err) {
    console.error('[gen-quota] registrando:', err instanceof Error ? err.message : String(err))
  }
}
