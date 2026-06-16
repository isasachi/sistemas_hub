/**
 * Cuota diaria de búsquedas (máx 3/usuario/día) + bloqueo de keyword repetida.
 * Zona horaria: America/Lima (día calendario peruano, UTC-5 fijo sin DST).
 *
 * Tabla: ph_user_searches — creada en supabase/migrations/20260615_ph_user_searches.sql
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProductRow, ProductCard } from '@ph/shared'

export const DAILY_LIMIT = 3

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
  | { ok: true;  count: number }
  | { ok: false; code: 'quota' | 'duplicate'; message: string }

/**
 * Verifica la cuota y la keyword repetida, y si todo está ok registra la búsqueda.
 * Se registra al INICIO (no al completarse), así las búsquedas fallidas/canceladas
 * también consumen cuota (evita bucles de abuso por reintentos).
 *
 * Devuelve `{ ok: true, count }` donde `count` incluye la búsqueda recién registrada.
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

  if (todayCount >= DAILY_LIMIT) {
    return {
      ok:      false,
      code:    'quota',
      message: `Llegaste al límite de ${DAILY_LIMIT} búsquedas por hoy. Vuelve mañana.`,
    }
  }

  const { data: existing } = await db
    .from('ph_user_searches')
    .select('id')
    .eq('user_id', userId)
    .eq('search_day', day)
    .eq('keyword_norm', norm)
    .maybeSingle()

  if (existing) {
    return {
      ok:      false,
      code:    'duplicate',
      message: 'Ya buscaste esa categoría hoy. Prueba con otra palabra clave.',
    }
  }

  const { error: insertError } = await db
    .from('ph_user_searches')
    .insert({ user_id: userId, keyword: rawKeyword, keyword_norm: norm, search_day: day })

  if (insertError) {
    if (insertError.code === '23505') {
      return {
        ok:      false,
        code:    'duplicate',
        message: 'Ya buscaste esa categoría hoy. Prueba con otra palabra clave.',
      }
    }
    console.error('[quota] error registrando búsqueda:', insertError.message)
    return { ok: true, count: todayCount + 1 }
  }

  return { ok: true, count: todayCount + 1 }
}

// ─── Resultados del día (para el consolidado) ─────────────────────────────────

function toCard(row: ProductRow): ProductCard | null {
  if (!row.analysis || row.score == null) return null
  const a = row.analysis
  const r = row.raw_data
  if (r.found_country === 'PE') return null
  if (r.ad_count < 40) return null
  if (r.days_running === null || r.days_running < 10) return null
  const pageParams = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
    view_all_page_id: r.page_id,
  })
  return {
    id: row.id,
    advertiserName: row.name ?? r.advertiser_name,
    productName: a.productName,
    whatIs: a.whatItIs,
    problemSolved: a.problemSolved,
    adCount: r.ad_count,
    daysRunning: r.days_running,
    foundCountry: r.found_country,
    attributes: a.attributes,
    peScenario: a.peScenario,
    peCompetitors: a.peCompetitors,
    priority: a.priority,
    score: row.score,
    adUrl: `https://www.facebook.com/ads/library/?id=${r.ad_id}`,
    pageUrl: `https://www.facebook.com/ads/library/?${pageParams}`,
  }
}

const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2, descartado: 2 }

/**
 * Devuelve los productos que el usuario vio hoy (día Lima), ordenados por
 * prioridad alta→media→baja y luego por score descendente.
 * Reconstruye desde ph_user_seen (seen_at en ventana del día Lima) + ph_products.
 */
export async function getTodaysResults(userId: string | null, day: string): Promise<ProductCard[]> {
  if (!userId) return []

  // Lima = UTC-5 (sin DST). Día Lima "YYYY-MM-DD" == ventana UTC [dayT05:00Z, nextDayT05:00Z)
  const dayStart = `${day}T05:00:00.000Z`
  const [yr, mo, d] = day.split('-').map(Number)
  const nextDay = new Date(Date.UTC(yr, mo - 1, d + 1))
  const dayEnd = `${nextDay.toISOString().split('T')[0]}T05:00:00.000Z`

  const db = getDb()

  const { data: seenRows, error: seenErr } = await db
    .from('ph_user_seen')
    .select('product_id')
    .eq('user_id', userId)
    .gte('seen_at', dayStart)
    .lt('seen_at', dayEnd)

  if (seenErr || !seenRows?.length) return []

  const productIds = seenRows.map((r: { product_id: string }) => r.product_id)

  const { data: rows, error: rowsErr } = await db
    .from('ph_products')
    .select('*')
    .in('id', productIds)

  if (rowsErr || !rows) return []

  return (rows as ProductRow[])
    .map(toCard)
    .filter((c): c is ProductCard => c !== null)
    .sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
      if (pDiff !== 0) return pDiff
      return b.score - a.score
    })
}
