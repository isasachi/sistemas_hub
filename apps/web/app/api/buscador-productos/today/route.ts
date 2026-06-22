/**
 * GET /api/buscador-productos/today
 *
 * Devuelve si el usuario agotó sus 3 búsquedas del día y, si es así,
 * los productos que vio hoy ordenados por prioridad. Usado al cargar la
 * página para restaurar el consolidado entre refreshes.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { readUserId } from '@/lib/product-hunter/session'
import { getDb, getTodaysResults, limaSearchDay, DAILY_LIMIT } from '@/lib/product-hunter/quota'

export async function GET() {
  const userId = await readUserId()
  if (!userId) return Response.json({ exhausted: false, products: [] })

  const day = limaSearchDay()

  const { count, error } = await getDb()
    .from('ph_user_searches')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('search_day', day)

  // En error DB no asumas "no agotado" (enmascararía el fallo y mostraría 0/3
  // falso). Reporta no-agotado pero deja rastro; el front no se rompe.
  if (error) {
    console.error('[today] error contando búsquedas:', error.message)
    return Response.json({ exhausted: false, products: [] })
  }

  if ((count ?? 0) < DAILY_LIMIT) {
    return Response.json({ exhausted: false, products: [] })
  }

  const products = await getTodaysResults(userId, day)
  return Response.json({ exhausted: true, products })
}
