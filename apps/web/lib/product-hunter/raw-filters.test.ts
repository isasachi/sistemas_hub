import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * Los filtros globales del buscador se traducen a query params de PostgREST, y esa
 * traducción es la única parte del cambio que no se puede leer del código: la escribe
 * supabase-js. Acá se intercepta `fetch` y se mira la URL que sale.
 *
 * Sin esto, un `.or(...)` mal escrito no falla — devuelve otra cosa, en silencio.
 */
const urls: string[] = []

function comoRespuesta(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  urls.length = 0
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proyecto.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-de-prueba')
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    urls.push(typeof input === 'string' ? input : input.toString())
    return comoRespuesta([])
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** La URL que se le pidió a PostgREST, ya decodificada para poder leerla. */
async function urlDe(fn: () => Promise<unknown>): Promise<string> {
  await fn()
  expect(urls).not.toHaveLength(0)
  return decodeURIComponent(urls[0])
}

describe('filtros globales → PostgREST', () => {
  it('sin filtros no agrega nada a la query', async () => {
    const { getApprovedByBucket } = await import('@ph/shared')
    const url = await urlDe(() => getApprovedByBucket('acne', '0-50', 10))

    expect(url).toContain('niche=eq.acne')
    expect(url).not.toContain('country=')
    expect(url).not.toContain('or=')
  })

  it('el país se traduce a un igual', async () => {
    const { getApprovedByBucket } = await import('@ph/shared')
    const url = await urlDe(() => getApprovedByBucket('acne', '0-50', 10, { country: 'PE' }))
    expect(url).toContain('country=eq.PE')
  })

  // ⚠️ EL PUNTO DEL ARCHIVO. `ad_start_date` nace NULL en las ~70k filas ya
  // guardadas, así que el filtro TIENE que incluirlas: sin el `is.null` la vitrina
  // queda vacía hasta que termine el backfill del worker.
  it('la antigüedad compara contra un corte E INCLUYE las filas sin medir', async () => {
    const { getApprovedByBucket } = await import('@ph/shared')
    const antes = Math.floor(Date.now() / 1000) - 30 * 86_400
    const url = await urlDe(() => getApprovedByBucket('acne', '0-50', 10, { minDias: 30 }))

    const m = url.match(/or=\(ad_start_date\.lte\.(\d+),ad_start_date\.is\.null\)/)
    expect(m).not.toBeNull()
    // El corte es "hace 30 días", con un par de segundos de tolerancia por el reloj.
    expect(Math.abs(Number(m![1]) - antes)).toBeLessThan(5)
  })

  it('minDias 0 (o null) no filtra: es la opción "cualquiera"', async () => {
    const { getApprovedByBucket } = await import('@ph/shared')
    expect(await urlDe(() => getApprovedByBucket('acne', '0-50', 10, { minDias: 0 })))
      .not.toContain('or=')
  })

  it('los dos filtros se combinan (AND) en la misma consulta', async () => {
    const { getApprovedByBucket } = await import('@ph/shared')
    const url = await urlDe(() =>
      getApprovedByBucket('acne', '0-50', 10, { country: 'MX', minDias: 90 }))

    expect(url).toContain('country=eq.MX')
    expect(url).toContain('ad_start_date.lte.')
  })

  // La query de categoría lleva un `select` acotado y hay que acordarse de pedir la
  // columna nueva, o la card nunca muestra los días.
  it('la consulta por categoría pide ad_start_date y aplica los filtros', async () => {
    const { getApprovedByCategory } = await import('@ph/shared')
    const url = await urlDe(() =>
      getApprovedByCategory(['acne'], '100+', 10, { country: 'CO', minDias: 10 }))

    expect(url).toContain('ad_start_date')
    expect(url).toContain('country=eq.CO')
    expect(url).toContain('ad_start_date.is.null')
  })
})
