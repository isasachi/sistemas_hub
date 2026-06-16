import type { Page } from 'playwright'
import type { AdNode } from '@ph/shared'

// Fallback determinista para cuando GraphQL+inline devuelven 0 nodos.
// Replica los extractores browser_evaluate del agente original (AGENTS_PROMPT.md).
// $0 LLM — solo querySelectorAll sobre hrefs y texto visible.
//
// Los AdNodes producidos son degradados: sin creatives ni pageCategories.
// El enrich posterior los completa si puede navegar a la página del anunciante.

// ─── Parsers puros (sin browser, testables con fixtures) ─────────────────────

export function parsePageIdsFromHrefs(hrefs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const href of hrefs) {
    try {
      const id = new URL(href).searchParams.get('view_all_page_id')
      if (id && /^\d+$/.test(id) && !seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    } catch { /* URL inválida */ }
  }
  return out
}

export function parseAdIdsFromHrefs(hrefs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const href of hrefs) {
    try {
      const id = new URL(href).searchParams.get('id')
      if (id && /^\d{10,}$/.test(id) && !seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    } catch { /* URL inválida */ }
  }
  return out
}

// Extrae ad count y días activos del texto visible de la card.
// Tolerante a locale es/en: "47 anuncios" | "47 ads" | "Started running 30 days ago"
const AD_COUNT_RX = /(\d[\d,.]*)\s*(?:anuncios?|ads?)\b/i
const DAYS_AGO_RX = /(?:empez[oó] a circular|started running)[^\d]*(\d+)\s*d(?:[ií]as?|ays?)/i

export function parseCardText(text: string): { adCount: number | null; daysRunning: number | null } {
  const countMatch = AD_COUNT_RX.exec(text)
  const adCount = countMatch ? parseInt(countMatch[1].replace(/[.,]/g, ''), 10) : null

  const daysMatch = DAYS_AGO_RX.exec(text)
  const daysRunning = daysMatch ? parseInt(daysMatch[1], 10) : null

  return { adCount, daysRunning }
}

// ─── Extractor DOM ────────────────────────────────────────────────────────────

// Activa los extractores del agente original cuando el schema GraphQL cambia
// o la interceptación falla. Produce AdNodes degradados marcados con source.
export async function extractFromDom(page: Page): Promise<AdNode[]> {
  const hrefs: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((h) => h.includes('facebook.com'))
  )

  const pageIds = parsePageIdsFromHrefs(hrefs)
  if (pageIds.length === 0) return []

  const adIds = parseAdIdsFromHrefs(hrefs)
  const bodyText = await page.evaluate(() => document.body.innerText)
  const { adCount, daysRunning } = parseCardText(bodyText)

  const startDate =
    daysRunning !== null
      ? Math.floor(Date.now() / 1000) - daysRunning * 86_400
      : null

  return pageIds.map((pageId, i) => ({
    adArchiveID: adIds[i] ?? adIds[0] ?? '',
    pageID: pageId,
    pageName: '',
    startDate,
    collationCount: adCount,
    bodyText: null,
    title: null,
    ctaText: null,
    linkUrl: null,
    pageCategories: [],
  }))
}
