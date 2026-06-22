/**
 * Rate-limit de las rutas que llaman Gemini (la generación es la llamada cara).
 * Sin esto, los endpoints de generación (app/api/.../route.ts) que generan
 * imágenes/texto eran world-callable sin tope → un curl en loop = gasto LLM ilimitado.
 *
 * Dos topes diarios (día America/Lima, reusa limaSearchDay de product-hunter/quota):
 *   GLOBAL  — backstop de costo: un atacante que limpia cookies NO lo evade.
 *   POR-USER — fairness por navegador (cookie ph_uid) / usuario auth.
 *
 * Tabla: ph_gen_usage — supabase/migrations/20260622000001_ph_gen_usage.sql
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { limaSearchDay } from './product-hunter/quota'
import { readUserId } from './product-hunter/session'

export const GLOBAL_DAILY_LIMIT = Number(process.env.GEN_GLOBAL_DAILY_LIMIT ?? 200)
export const USER_DAILY_LIMIT = Number(process.env.GEN_USER_DAILY_LIMIT ?? 10)

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

export type GenGuard = { ok: true } | { ok: false; message: string }

/**
 * Verifica ambos topes y, si pasan, registra la generación (1 fila = 1 request).
 *
 * ponytail: count-then-insert no es atómico → bajo ráfaga concurrente el tope puede
 * sobrepasarse por ~(concurrencia) filas. Aceptable para un backstop de costo (acota
 * el gasto a ~limit+burst). Upgrade: RPC con lock si se necesita el tope exacto.
 *
 * ponytail: fail-open ante error DB (igual que checkAndRecordSearch). El abuso real
 * es DB-up + atacante, y con DB-up el tope corta. Upgrade a fail-closed si aparece
 * abuso con DB caída.
 */
export async function guardGeneration(userId: string | null, kind: string): Promise<GenGuard> {
  const db = getDb()
  const day = limaSearchDay()

  const { count: globalCount, error: gErr } = await db
    .from('ph_gen_usage')
    .select('*', { count: 'exact', head: true })
    .eq('gen_day', day)

  if (gErr) {
    console.error('[gen-quota] error contando global:', gErr.message)
    return { ok: true }
  }
  if ((globalCount ?? 0) >= GLOBAL_DAILY_LIMIT) {
    return { ok: false, message: 'El servicio alcanzó su límite diario de generaciones. Vuelve mañana.' }
  }

  if (userId) {
    const { count: userCount, error: uErr } = await db
      .from('ph_gen_usage')
      .select('*', { count: 'exact', head: true })
      .eq('gen_day', day)
      .eq('user_id', userId)

    if (!uErr && (userCount ?? 0) >= USER_DAILY_LIMIT) {
      return { ok: false, message: `Llegaste al límite de ${USER_DAILY_LIMIT} generaciones por hoy. Vuelve mañana.` }
    }
  }

  const { error: insErr } = await db
    .from('ph_gen_usage')
    .insert({ user_id: userId, kind, gen_day: day })
  if (insErr) console.error('[gen-quota] error registrando generación:', insErr.message)

  return { ok: true }
}

/**
 * Azúcar para las rutas: lee la identidad, aplica el guard, y devuelve un
 * Response 429 listo si excede (o null si puede proceder). Sirve para rutas
 * JSON y SSE por igual (se llama ANTES de crear el stream).
 *
 *   const blocked = await genQuotaResponse('branding-logo')
 *   if (blocked) return blocked
 */
export async function genQuotaResponse(kind: string): Promise<Response | null> {
  const userId = await readUserId()
  const guard = await guardGeneration(userId, kind)
  if (guard.ok) return null
  return Response.json({ error: guard.message }, { status: 429 })
}
