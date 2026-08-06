import { NextResponse } from 'next/server'
import { getTopPicks } from '@ph/shared'
import { toCard } from '@/lib/product-hunter/to-card'
import type { ProductCard } from '@ph/shared'

// ⚠️ Solo LEE de Supabase (sin LLM ni Playwright). Showcase igual para todos →
// cacheable 1h. Corre a lo sumo una vez por hora, no en cada request.
export const revalidate = 3600

export async function GET() {
  try {
    const rows = await getTopPicks(6)
    const seen = new Set<string>()
    const products: ProductCard[] = []
    for (const row of rows) {
      if (seen.has(row.niche)) continue // uno por nicho (toCard no expone el nicho)
      const card = toCard(row)
      if (!card) continue
      seen.add(row.niche)
      products.push(card)
      if (products.length >= 6) break
    }
    return NextResponse.json({ products })
  } catch {
    // Nunca 500: si falla, el strip simplemente no aparece (patrón best-effort).
    return NextResponse.json({ products: [] })
  }
}
