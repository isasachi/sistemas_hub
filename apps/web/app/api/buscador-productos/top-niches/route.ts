import { NextResponse } from 'next/server'
import { getTopNiches } from '@ph/shared'

// ⚠️ Igual que `search`: SOLO lee de Supabase. Ni Anthropic ni Playwright.
//
// Los nichos con más productos en la base — son los chips del buscador, y desde
// que no hay barra de búsqueda son la ÚNICA navegación de la tool: por eso 36 y
// no 12. La UI los colapsa a dos filas con un "Expandir".
//
// ponytail: sin caché, igual que top-picks. Es un HashAggregate sobre 28k filas
// (~30ms) y el dato solo se mueve cuando el daemon scrapea. Si algún día pesa,
// `export const dynamic = 'force-static'` + `revalidate` acá alcanza.

const TOP_NICHOS = 36

export async function GET() {
  try {
    return NextResponse.json({ niches: await getTopNiches(TOP_NICHOS) })
  } catch (err) {
    // La portada tiene que abrir igual: sin chips queda solo el marquee de top
    // picks — degradado (no hay cómo elegir nicho), pero no una pantalla rota.
    console.error('[top-niches]', err)
    return NextResponse.json({ niches: [] })
  }
}
