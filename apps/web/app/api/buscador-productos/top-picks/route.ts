import { NextResponse } from 'next/server'
import { getTopPicks, type RawProductEntry } from '@ph/shared'
import { toEntry } from '@/lib/product-hunter/entry'

// ⚠️ Igual que `search`: SOLO lee de Supabase. Ni Anthropic ni Playwright.
//
// Top picks = lo mejor del rango más alto (100+) de todos los nichos: primero
// los verificados monoproducto, después relleno por nº de anuncios (ver
// getTopPicks). No hay tabla snapshot: la lista se arma en vivo sobre el
// ad_count que escribe el refresco de vigencia, así que se mueve con el daemon
// sin nada que recalcular.
//
// ponytail: sin caché. Medido: ~0.4s, y la segunda pasada (la de 1000 filas) casi
// nunca corre porque hoy los verificados llenan las 12 solos. Si algún día pesa,
// `export const dynamic = 'force-static'` + `revalidate` acá alcanza — el dato solo
// se mueve cuando corre el refresco de 48h.

const TOP_PICKS = 12

export async function GET() {
  try {
    const rows = await getTopPicks(TOP_PICKS)
    return NextResponse.json({ products: rows.map(toEntry) satisfies RawProductEntry[] })
  } catch (err) {
    // La portada tiene que abrir igual: sin top picks se ve solo el buscador.
    console.error('[top-picks]', err)
    return NextResponse.json({ products: [] })
  }
}
