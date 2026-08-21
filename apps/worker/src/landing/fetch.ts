// Descarga de la landing (spec §21). NO pasa por Playwright: son tiendas de
// terceros, no Meta, así que un fetch plano alcanza y el 403 que obliga a la
// sesión same-origin no aplica acá.
//
// ⚠️ NO COMPARTE EL RATE-CONTROL DE META, y es deliberado. Ese controlador
// existe para que una IP no se gane un block de Facebook; meterle 300 fetches a
// Shopify dispararía sus cool-downs y frenaría las lecturas de Meta sin ningún
// motivo. Pool y límites propios.
//
// Cuatro guards, cada uno por un modo de fallo concreto:
//  1. TIMEOUT — `fetch` en Node NO tiene timeout por default. Este repo ya se
//     comió el incidente: en `nano-banana.ts` una conexión que quedó abierta
//     colgó el proceso entero y el tope de tiempo nunca llegó a evaluarse.
//  2. TOPE DE CUERPO — una tienda con un HTML de 40 MB revienta al worker por
//     memoria, y el daemon ya tiene historial de OOM.
//  3. TOPE DE REDIRECTS — las landings de ads encadenan trackers.
//  4. CONTENT-TYPE — un PDF o una imagen no se parsean como HTML: se reporta
//     "sin landing" en vez de alimentar basura al parser.
const TIMEOUT_MS = Math.max(1_000, Number(process.env.DISC_LANDING_TIMEOUT_MS ?? 15_000))
const MAX_BYTES = Math.max(64_000, Number(process.env.DISC_LANDING_MAX_BYTES ?? 2_000_000))
const MAX_REDIRECTS = 5

// Un navegador de verdad: muchas tiendas devuelven 403 a un user-agent vacío.
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
}

export interface FetchedPage {
  url: string
  finalUrl: string
  statusCode: number | null
  contentType: string | null
  html: string | null
  error: string | null
}

/**
 * Lee el HTML de una landing. NUNCA lanza: un fallo de red es un dato del
 * candidato (`error`), no una excepción que tire la corrida entera.
 */
export async function fetchLanding(url: string): Promise<FetchedPage> {
  const base: FetchedPage = { url, finalUrl: url, statusCode: null, contentType: null, html: null, error: null }
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    base.finalUrl = res.url || url
    base.statusCode = res.status
    const ct = res.headers.get('content-type')
    base.contentType = ct

    if (!res.ok) { base.error = `HTTP ${res.status}`; return base }
    if (ct && !/text\/html|application\/xhtml/i.test(ct)) {
      base.error = `content-type ${ct.split(';')[0]}`
      return base
    }

    base.html = await readCapped(res)
    return base
  } catch (e) {
    // AbortError (timeout), DNS, TLS, socket. Todos son "no se pudo leer".
    base.error = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : String(e).slice(0, 200)
    return base
  }
}

/**
 * Lee el cuerpo cortando en MAX_BYTES. Se hace por streaming y no con
 * `res.text()` porque `text()` bufferea el archivo ENTERO antes de que se pueda
 * mirar su tamaño — o sea el tope llegaría después de la explosión de memoria.
 */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) { chunks.push(value); total += value.length }
    }
  } finally {
    // Cancelar libera el socket: sin esto, cortar por tope deja la conexión
    // abierta hasta que el server se aburra.
    await reader.cancel().catch(() => {})
  }
  const buf = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, total - off)), off); off += c.length }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(0, Math.min(off, MAX_BYTES)))
}

export { MAX_REDIRECTS, TIMEOUT_MS, MAX_BYTES }
