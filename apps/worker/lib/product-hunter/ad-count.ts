// Conteo de anuncios activos de un anunciante, en vivo.
//
// Barato a propósito: el total llega en el JSON inline del SSR a ~1,4s de
// cargar (medido 2026-07-30), así que NO se usa navigateAndCapture — sus 8s de
// espera + 3 scrolls existen para juntar creativos, que acá no hacen falta.
// ~2s por anunciante en vez de ~15s. Un fetch plano no sirve: Meta da 403.
//
// Lo usan el scraper (para rangear al descubrir) y el refresco de 48h (para
// detectar bajas y mover de rango a los que crecieron).
import type { Page } from 'playwright'
import { isPersistentlyBlocked, PersistentBlockError, rateGateMs, pageUrl } from './scraper'

const COUNT_TIMEOUT_MS = Math.max(2_000, Number(process.env.PH_COUNT_TIMEOUT ?? 10_000))
const JITTER_MS = Math.max(0, Number(process.env.PH_JITTER_MS ?? 500))
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// null = no se pudo leer (página rara o navegación bloqueada). 0 = el anunciante
// existe pero no tiene anuncios activos. La diferencia importa: solo el 0
// justifica dar de baja un producto.
export async function fetchAdCount(page: Page, pageId: string): Promise<number | null> {
  if (isPersistentlyBlocked()) throw new PersistentBlockError()
  const gate = rateGateMs()
  if (gate > 0) await sleep(gate)
  if (JITTER_MS) await sleep(Math.random() * JITTER_MS)

  await page.goto(pageUrl(pageId), { timeout: 30_000, waitUntil: 'domcontentloaded' })
  const deadline = Date.now() + COUNT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const count = await page.evaluate(() => {
      for (const s of Array.from(document.querySelectorAll('script[type="application/json"]'))) {
        const t = s.textContent ?? ''
        if (!t.includes('search_results_connection')) continue
        const m = /"search_results_connection":\{[^{]*?"count":(\d+)/.exec(t)
        if (m) return Number(m[1])
      }
      // Respaldo: el "~N resultados" que Meta renderiza en texto visible.
      const dm = /~?\s*([\d.,]+)\s*(?:resultados?|results?)/i.exec(document.body?.innerText ?? '')
      return dm ? Number(dm[1].replace(/[.,]/g, '')) : null
    }).catch(() => null)
    if (count !== null) return count
    await page.waitForTimeout(250)
  }
  return null
}
