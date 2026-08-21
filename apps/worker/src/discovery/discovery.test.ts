// Cubre lo que se rompe EN SILENCIO: el tope de la matriz (sin él, editar un
// diccionario multiplica las llamadas a Meta), la normalización de URLs (una
// excepción tira el anuncio entero) y el reparto de la matriz por país.
import { describe, it, expect } from 'vitest'
import { normalizeQuery, dictionaryKey } from './normalize-query'
import { expandKeyword, morphVariants, MAX_QUERIES_PER_SEED } from './expand'
import { buildMatrix } from './matrix'
import { loadDictionary } from './dictionaries'
import { normalizeUrl, domainOf } from '../normalization/url'
import { dedupeKey } from '../normalization/ad'
import type { SsrAd } from '../../lib/product-hunter/ssr-fetch'

describe('normalizeQuery', () => {
  it('quita acentos, mayúsculas y puntuación', () => {
    expect(normalizeQuery('DOLOR DE MUÉLA')).toBe('dolor de muela')
    expect(normalizeQuery('  ¿Dolor,  dental?  ')).toBe('dolor dental')
  })
  it('da la clave de archivo del diccionario', () => {
    expect(dictionaryKey('Dolor de Muela')).toBe('dolor_de_muela')
  })
})

describe('expandKeyword', () => {
  const dict = loadDictionary('dolor de muela')

  it('el diccionario del spec existe y se lee', () => {
    expect(dict).not.toBeNull()
    expect(dict!.problem).toContain('dolor de muela')
  })

  it('sale normalizado y sin repetidos', () => {
    const out = expandKeyword('dolor de muela', dict!)
    expect(out.length).toBe(new Set(out).size)
    for (const q of out) expect(q).toBe(normalizeQuery(q))
  })

  it('la semilla va primero: si el tope corta, no se pierde lo que pidió el usuario', () => {
    expect(expandKeyword('dolor de muela', dict!)[0]).toBe('dolor de muela')
  })

  it('RESPETA el tope aunque el diccionario sea enorme', () => {
    const gordo = {
      problem: Array.from({ length: 500 }, (_, i) => `termino ${i}`),
      symptom: [], intent: [], commercial: [], product: [],
    }
    expect(expandKeyword('semilla', gordo).length).toBe(MAX_QUERIES_PER_SEED)
  })

  it('sin diccionario devuelve al menos la semilla, nunca cero queries', () => {
    const out = expandKeyword('nicho que nadie escribio todavia')
    expect(out).toContain('nicho que nadie escribio todavia')
  })

  it('agrega la variante plural sin perder la singular', () => {
    const v = morphVariants('dolor de muela')
    expect(v).toContain('dolor de muela')
    expect(v).toContain('dolor de muelas')
  })

  it('NO pluraliza en medio de la frase: rompe la concordancia', () => {
    // "muela picada" → "muelas picada" sería una búsqueda que nadie escribe.
    expect(morphVariants('muela picada')).toEqual(['muela picada'])
    expect(morphVariants('diente sensible')).toEqual(['diente sensible'])
  })

  // El invariante es sobre lo que INVENTA la morfología, no sobre el
  // diccionario: `encias inflamadas` es una entrada curada y concuerda bien.
  // Toda variante generada tiene que terminar en la palabra pluralizada.
  it('la morfología no introduce concordancia rota en ninguna query', () => {
    const inventadas = expandKeyword('dolor de muela', dict!)
      .flatMap((q) => morphVariants(q).slice(1))
    expect(inventadas.length).toBeGreaterThan(0)
    for (const v of inventadas) {
      expect(v).toMatch(/(muelas|dientes|encias|plantillas|cremas|rodilleras)$/)
    }
  })
})

describe('buildMatrix', () => {
  it('intercala por país: cortar temprano deja todos los países cubiertos', () => {
    const jobs = buildMatrix('dolor de muela', ['CO', 'MX'])
    expect(new Set(jobs.slice(0, 2).map((j) => j.country))).toEqual(new Set(['CO', 'MX']))
  })
  it('cada (query,país) aparece una sola vez', () => {
    const jobs = buildMatrix('dolor de muela', ['CO', 'MX', 'AR'])
    const keys = jobs.map((j) => `${j.query}|${j.country}`)
    expect(keys.length).toBe(new Set(keys).size)
  })
})

describe('normalizeUrl', () => {
  it('quita utm_* y los click ids, conserva los funcionales', () => {
    expect(normalizeUrl('https://shop.com/p?id=123&utm_source=fb&fbclid=xyz'))
      .toBe('https://shop.com/p?id=123')
  })
  it('desenvuelve el redirect de facebook', () => {
    expect(normalizeUrl('https://l.facebook.com/l.php?u=https%3A%2F%2Fshop.com%2Fp%3Fid%3D1&fbclid=a'))
      .toBe('https://shop.com/p?id=1')
  })
  it('NO LANZA con basura: devuelve el input en vez de tirar el anuncio', () => {
    expect(() => normalizeUrl('no es una url')).not.toThrow()
    expect(normalizeUrl('no es una url')).toBe('no es una url')
    expect(normalizeUrl(null)).toBeNull()
    expect(normalizeUrl('')).toBeNull()
  })
  it('la barra final no parte la misma página en dos', () => {
    expect(normalizeUrl('https://shop.com/p/')).toBe(normalizeUrl('https://shop.com/p'))
  })
  it('domainOf tolera lo ilegible', () => {
    expect(domainOf('https://www.Shop.com/p')).toBe('shop.com')
    expect(domainOf('basura')).toBeNull()
  })
})

describe('dedupeKey', () => {
  const base = { page_id: '1', title: 't', body: 'b' } as unknown as SsrAd

  it('usa el ad_archive_id cuando existe', () => {
    expect(dedupeKey({ ...base, ad_archive_id: '99' } as SsrAd, null)).toBe('aid:99')
  })
  it('sin archive id, mismo contenido = misma clave', () => {
    const a = dedupeKey({ ...base, ad_archive_id: null } as SsrAd, 'https://shop.com/p')
    const b = dedupeKey({ ...base, ad_archive_id: null } as SsrAd, 'https://shop.com/p')
    expect(a).toBe(b)
    expect(a.startsWith('h:')).toBe(true)
  })
  // El camino `h:` NO se ejercita en vivo: todo lo que devolvió Meta en las
  // corridas reales traía ad_archive_id. Estas dos son su única cobertura.
  it('dos anuncios que solo difieren en un utm_ colapsan a la misma clave', () => {
    const a = { ...base, ad_archive_id: null, link_url: 'https://shop.com/p?utm_source=fb' } as SsrAd
    const b = { ...base, ad_archive_id: null, link_url: 'https://shop.com/p' } as SsrAd
    expect(dedupeKey(a, normalizeUrl(a.link_url))).toBe(dedupeKey(b, normalizeUrl(b.link_url)))
  })

  it('sin archive id, distinta landing = distinta clave', () => {
    const a = dedupeKey({ ...base, ad_archive_id: null } as SsrAd, 'https://shop.com/a')
    const b = dedupeKey({ ...base, ad_archive_id: null } as SsrAd, 'https://shop.com/b')
    expect(a).not.toBe(b)
  })
})
