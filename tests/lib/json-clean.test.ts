import { describe, it, expect } from 'vitest'
import { cleanJsonText, sanitizeJsonDeep } from '@/lib/product-hunter/json-clean'

describe('cleanJsonText', () => {
  it('elimina un lone high surrogate (emoji partido por slice)', () => {
    // El caso real del bug: slice(0, N) corta un emoji 💪 (2 unidades UTF-16)
    const body = 'Alivia el dolor 💪'.slice(0, 17) // corta el emoji a la mitad
    expect(body.length).toBe(17)
    const clean = cleanJsonText(body)
    expect(clean).toBe('Alivia el dolor ')
    // El resultado debe ser JSON válido para Postgres (sin \udXXX suelto)
    expect(() => JSON.parse(JSON.stringify(clean))).not.toThrow()
    expect(/[\uD800-\uDFFF]/.test(clean)).toBe(false)
  })

  it('elimina un lone low surrogate', () => {
    const s = '\uDC00resto del texto'
    expect(cleanJsonText(s)).toBe('resto del texto')
  })

  it('conserva emojis completos (pares válidos)', () => {
    const s = 'Rodillera 💪 premium 🔥'
    expect(cleanJsonText(s)).toBe(s)
  })

  it('elimina el carácter nulo (Postgres lo rechaza en jsonb/text)', () => {
    expect(cleanJsonText('hola\u0000mundo')).toBe('holamundo')
  })

  it('texto normal queda intacto', () => {
    expect(cleanJsonText('Faja lumbar con varillas — envío gratis')).toBe(
      'Faja lumbar con varillas — envío gratis'
    )
  })
})

describe('sanitizeJsonDeep', () => {
  it('limpia strings anidados en objetos y arrays (shape de raw_data)', () => {
    const rawData = {
      advertiser_name: 'Tienda\uD83D Salud', // lone surrogate en el nombre
      ad_count: 47,
      days_running: null,
      creatives: [
        { body: 'Texto cortado \uD83E', title: 'Rodillera 💪', cta: null, link: 'https://x.com' },
      ],
    }
    const clean = sanitizeJsonDeep(rawData)
    expect(clean.advertiser_name).toBe('Tienda Salud')
    expect(clean.creatives[0].body).toBe('Texto cortado ')
    expect(clean.creatives[0].title).toBe('Rodillera 💪') // par válido se conserva
    expect(clean.ad_count).toBe(47)          // números intactos
    expect(clean.days_running).toBeNull()    // null intacto
    expect(clean.creatives[0].cta).toBeNull()
  })

  it('no rompe con valores primitivos', () => {
    expect(sanitizeJsonDeep(42)).toBe(42)
    expect(sanitizeJsonDeep(null)).toBeNull()
    expect(sanitizeJsonDeep(true)).toBe(true)
  })
})
