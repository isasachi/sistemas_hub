/**
 * Cuota diaria de búsquedas + bloqueo de keyword repetida.
 *
 * ⚠️ TEMPORAL (2026-08-05): checkAndRecordSearch ya NO se llama desde ninguna
 * ruta — el usuario pidió quitar el límite de 3/día. El módulo se conserva
 * entero (con su registro en ph_user_searches) para reponerlo con una línea;
 * limaSearchDay lo sigue usando gen-quota.ts.
 * Zona horaria: America/Lima (día calendario peruano, UTC-5 fijo sin DST).
 *
 * Tabla: ph_user_searches — creada en supabase/migrations/20260615_ph_user_searches.sql
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const DAILY_LIMIT = 3

let _db: SupabaseClient | null = null
export function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return _db
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fecha del día en hora Lima como string YYYY-MM-DD.
 * 'en-CA' produce formato ISO — sin dependencias adicionales.
 */
export function limaSearchDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(now)
}

/**
 * Normaliza la keyword del usuario: sin acentos, minúsculas, sin espacios extra.
 */
export function normalizeKeyword(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

// ─── Cuota + bloqueo de keyword ───────────────────────────────────────────────

export type QuotaResult =
  | { ok: true;  count: number; recheck?: boolean }
  | { ok: false; code: 'quota'; message: string }

/**
 * Verifica la cuota y registra la búsqueda. Se registra al INICIO (no al
 * completarse), así las búsquedas fallidas/canceladas también consumen cuota
 * (evita bucles de abuso por reintentos).
 *
 * Re-buscar la MISMA keyword el mismo día NO consume cuota (`recheck: true`):
 * es el camino para revisar un nicho que quedó "en cola/analizando" sin que la
 * espera cueste una de las 3/día — la ruta solo lee Supabase ($0). Por eso el
 * recheck se permite incluso al límite (no es una búsqueda nueva).
 *
 * Devuelve `{ ok: true, count }` con la búsqueda recién registrada incluida.
 * Fail-open: si la DB falla, deja pasar para no bloquear al usuario.
 */
export async function checkAndRecordSearch(
  userId: string | null,
  rawKeyword: string,
): Promise<QuotaResult> {
  if (!userId) return { ok: true, count: 1 }

  const day  = limaSearchDay()
  const norm = normalizeKeyword(rawKeyword)
  const db   = getDb()

  const { count, error: countError } = await db
    .from('ph_user_searches')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('search_day', day)

  if (countError) {
    console.error('[quota] error contando búsquedas:', countError.message)
    return { ok: true, count: 1 }
  }

  const todayCount = count ?? 0

  // Recheck: ya buscó esta keyword hoy → pase libre (no cuenta, no registra),
  // aun al límite. Se ANTEPONE al gate de cuota a propósito.
  const { data: existing } = await db
    .from('ph_user_searches')
    .select('id')
    .eq('user_id', userId)
    .eq('search_day', day)
    .eq('keyword_norm', norm)
    .maybeSingle()

  if (existing) return { ok: true, count: todayCount, recheck: true }

  if (todayCount >= DAILY_LIMIT) {
    return {
      ok:      false,
      code:    'quota',
      message: `Llegaste al límite de ${DAILY_LIMIT} búsquedas por hoy. Vuelve mañana.`,
    }
  }

  const { error: insertError } = await db
    .from('ph_user_searches')
    .insert({ user_id: userId, keyword: rawKeyword, keyword_norm: norm, search_day: day })

  if (insertError) {
    // Carrera: otro request insertó la misma keyword a la vez → es un recheck.
    if (insertError.code === '23505') return { ok: true, count: todayCount, recheck: true }
    console.error('[quota] error registrando búsqueda:', insertError.message)
    return { ok: true, count: todayCount + 1 }
  }

  return { ok: true, count: todayCount + 1 }
}

// ─── Resultados del día (para el consolidado) ─────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2, descartado: 2 }

/**
 * Devuelve los productos que el usuario vio hoy (día Lima), ordenados por
 * prioridad alta→media→baja y luego por score descendente.
 * Reconstruye desde ph_user_seen (seen_at en ventana del día Lima) + ph_products.
 */
