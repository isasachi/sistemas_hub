import { NextResponse } from 'next/server'
import { getTopNiches } from '@ph/shared'

// ⚠️ Igual que `search`: SOLO lee de Supabase. Ni Anthropic ni Playwright.
//
// Los nichos con más productos en la base — son los chips de sugerencia del
// buscador. Sirven para arrancar: un click y hay resultados garantizados.
//
// ponytail: sin caché, igual que top-picks. Es un HashAggregate sobre 28k filas
// (~30ms) y el dato solo se mueve cuando el daemon scrapea. Si algún día pesa,
// `export const dynamic = 'force-static'` + `revalidate` acá alcanza.

const TOP_NICHOS = 12

export async function GET() {
  try {
    return NextResponse.json({ niches: await getTopNiches(TOP_NICHOS) })
  } catch (err) {
    // La portada tiene que abrir igual: sin chips se ve solo el buscador.
    console.error('[top-niches]', err)
    return NextResponse.json({ niches: [] })
  }
}
