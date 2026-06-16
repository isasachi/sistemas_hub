/**
 * GET /api/buscador-productos/today
 *
 * Devuelve si el usuario agotó sus 3 búsquedas del día y, si es así,
 * los productos que vio hoy ordenados por prioridad. Usado al cargar la
 * página para restaurar el consolidado entre refreshes.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { readUserId } from '@/lib/product-hunter/session'
import { getTodaysResults, limaSearchDay, DAILY_LIMIT } from '@/lib/product-hunter/quota'

export async function GET() {
  const userId = await readUserId()
  if (!userId) return Response.json({ exhausted: false, products: [] })

  const day = limaSearchDay()
  const db  = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { count } = await db
    .from('ph_user_searches')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('search_day', day)

  if ((count ?? 0) < DAILY_LIMIT) {
    return Response.json({ exhausted: false, products: [] })
  }

  const products = await getTodaysResults(userId, day)
  return Response.json({ exhausted: true, products })
}
