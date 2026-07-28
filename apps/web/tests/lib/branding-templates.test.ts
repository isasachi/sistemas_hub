import { describe, it, expect } from 'vitest'
import {
  TEMPLATES, CATEGORIES, getTemplate, normalizeTokens,
  matchTemplates, isSameProduct,
} from '@/lib/branding/templates'

describe('normalizeTokens', () => {
  it('baja, quita acentos y puntuación, y descarta stopwords', () => {
    expect(normalizeTokens('Corrector de Postura')).toEqual(['corrector', 'postura'])
    expect(normalizeTokens('almohada ergonómica')).toEqual(['almohada', 'ergonomica'])
  })

  it('desplurariza sólo palabras suficientemente largas', () => {
    expect(normalizeTokens('bandas elásticas')).toEqual(['banda', 'elastica'])
    expect(normalizeTokens('snacks')).toEqual(['snack'])
    // "serum" no termina en s: no se toca
    expect(normalizeTokens('serum')).toEqual(['serum'])
  })

  it('produce una clave de matching, no una palabra real, y no toca préstamos cortos', () => {
    // "cable"→"cabl" no es una palabra en español: es la clave con la que
    // debe converger cualquier forma plural que el stemmer produzca para el
    // mismo concepto. "usb" no termina en s/e: pasa intacto.
    expect(normalizeTokens('cable usb')).toEqual(['cabl', 'usb'])
  })
})

describe('catálogo', () => {
  it('tiene 30 plantillas, 6 por cada una de las 5 categorías', () => {
    expect(TEMPLATES).toHaveLength(30)
    for (const c of CATEGORIES) {
      expect(TEMPLATES.filter((t) => t.categoryId === c.id)).toHaveLength(6)
    }
  })

  it('los ids son únicos y su prefijo es la categoría', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(30)
    for (const t of TEMPLATES) {
      const [prefix, slug] = t.id.split('/')
      expect(prefix, t.id).toBe(t.categoryId)
      expect(slug, t.id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('getTemplate lanza con un id desconocido', () => {
    expect(() => getTemplate('no/existe')).toThrow(/Plantilla desconocida/)
  })
})

describe('matchTemplates', () => {
  it('resalta la plantilla del producto que el usuario describe', () => {
    const top = matchTemplates('suero facial antiedad')[0]
    expect(top.template.id).toBe('belleza/serum-facial')
    expect(top.score).toBeGreaterThan(0)
  })

  it('no resalta plantillas de otra categoría', () => {
    const ids = matchTemplates('suero facial antiedad').map((r) => r.template.id)
    expect(ids).not.toContain('celulares/power-bank')
  })

  it('tolera acentos y sinónimos vía keywords', () => {
    const top = matchTemplates('batidora portátil para smoothies')[0]
    expect(top.template.id).toBe('cocina/licuadora-portatil')
  })

  it('filtra por categoría cuando se le pasa una', () => {
    const res = matchTemplates('shampoo', 'mascotas')
    expect(res.every((r) => r.template.categoryId === 'mascotas')).toBe(true)
    expect(res[0].template.id).toBe('mascotas/shampoo-para-mascotas')
  })

  it('devuelve vacío para algo que no matchea nada', () => {
    expect(matchTemplates('turbina hidroeléctrica')).toEqual([])
  })

  it('matchea "smoothies" solo, aunque el stemmer no debe mutilar el loanword hasta separarlo de la keyword "smoothie"', () => {
    const top = matchTemplates('smoothies')[0]
    expect(top?.template.id).toBe('cocina/licuadora-portatil')
  })

  it('matchea "uv" aunque tenga sólo 2 caracteres', () => {
    const top = matchTemplates('uv')[0]
    expect(top?.template.id).toBe('belleza/protector-solar')
  })

  it('matchea "aceites capilares" (plural en -es tras consonante) contra la keyword singular "aceite"', () => {
    const top = matchTemplates('aceites capilares')[0]
    expect(top?.template.id).toBe('belleza/aceite-capilar')
    // score 2: "aceites"→aceite y "capilares"→capilar deben matchear las DOS keywords,
    // no sólo "capilar" (que por sí sola ya desambigua y esconde el bug de "aceite").
    expect(top?.score).toBe(2)
  })

  it('matchea "soportes para celular" (plural en -es tras consonante) contra la keyword singular "soporte"', () => {
    const top = matchTemplates('soportes para celular')[0]
    expect(top?.template.id).toBe('celulares/tripode-para-celular')
    // score 2: "soportes"→soporte y "celular" deben matchear las DOS keywords,
    // no sólo "celular" (que por sí sola ya desambigua y esconde el bug de "soporte").
    expect(top?.score).toBe(2)
  })
})

describe('isSameProduct', () => {
  it('es verdadero cuando el sustantivo núcleo coincide', () => {
    expect(isSameProduct(getTemplate('belleza/serum-facial'), 'serum facial con vitamina C')).toBe(true)
  })

  it('es verdadero cuando el núcleo del usuario es un sinónimo del catálogo', () => {
    expect(isSameProduct(getTemplate('belleza/serum-facial'), 'suero facial antiedad')).toBe(true)
  })

  it('es falso cuando sólo coincide un adjetivo compartido', () => {
    // "crema facial" y "serum facial" comparten "facial" pero son productos distintos
    expect(isSameProduct(getTemplate('belleza/serum-facial'), 'crema facial hidratante')).toBe(false)
  })

  it('es falso entre categorías', () => {
    expect(isSameProduct(getTemplate('belleza/serum-facial'), 'rodillera deportiva')).toBe(false)
  })

  it('es falso cuando el núcleo del usuario sólo coincide con un atributo/keyword ancho, no con un sinónimo del núcleo', () => {
    // "vitamina" es keyword de serum-facial (atributo), pero no nombra el producto
    expect(isSameProduct(getTemplate('belleza/serum-facial'), 'vitamina C para el rostro')).toBe(false)
  })

  it('es verdadero para "bloqueador", sinónimo de mercado peruano de protector solar', () => {
    expect(isSameProduct(getTemplate('belleza/protector-solar'), 'bloqueador solar FPS 50')).toBe(true)
  })

  it('es verdadero cuando el sinónimo aparece en un token que no es el primero', () => {
    expect(isSameProduct(getTemplate('belleza/shampoo'), '10 unidades de champu')).toBe(true)
  })
})

import { hasLegalPair, buildPalettes } from '@/lib/branding/palette-variants'
import type { PaletteColor } from '@/lib/branding/types'

describe('hasLegalPair', () => {
  it('acepta una paleta con un par texto/fondo de contraste >= 4.5:1', () => {
    const p: PaletteColor[] = [
      { hex: '#FFFFFF', name: 'blanco', role: 'background' },
      { hex: '#111111', name: 'negro', role: 'primary' },
    ]
    expect(hasLegalPair(p)).toBe(true)
  })

  it('rechaza una paleta sin ningún par legible', () => {
    const p: PaletteColor[] = [
      { hex: '#FFFFFF', name: 'blanco', role: 'background' },
      { hex: '#FAFAFA', name: 'casi blanco', role: 'primary' },
    ]
    expect(hasLegalPair(p)).toBe(false)
  })

  it('rechaza una paleta sin fondo ni neutral (no hay sobre qué poner texto)', () => {
    const p: PaletteColor[] = [
      { hex: '#111111', name: 'negro', role: 'primary' },
      { hex: '#FF0000', name: 'rojo', role: 'accent' },
    ]
    expect(hasLegalPair(p)).toBe(false)
  })
})

describe('buildPalettes', () => {
  const original: PaletteColor[] = [
    { hex: '#FFFFFF', name: 'blanco', role: 'background' },
    { hex: '#111111', name: 'negro', role: 'primary' },
  ]
  const good: PaletteColor[] = [
    { hex: '#F4EDE0', name: 'crema', role: 'background' },
    { hex: '#2B2420', name: 'tinta', role: 'primary' },
  ]
  const bad: PaletteColor[] = [
    { hex: '#FFFFFF', name: 'blanco', role: 'background' },
    { hex: '#FAFAFA', name: 'casi blanco', role: 'primary' },
  ]

  it('pone la original primera y conserva las variantes válidas', () => {
    const out = buildPalettes(original, [good, good])
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual(original)
  })

  it('descarta las variantes que no pasan el contraste', () => {
    expect(buildPalettes(original, [good, bad])).toHaveLength(2)
  })

  it('lanza si la paleta original misma es ilegible', () => {
    expect(() => buildPalettes(bad, [good, good])).toThrow(/paleta original/)
  })
})

import { TEMPLATE_DNA } from '@/lib/branding/template-dna'

describe('integridad del manifiesto de ADN', () => {
  const entries = Object.entries(TEMPLATE_DNA)

  it('no tiene entradas huérfanas: cada id existe en el catálogo', () => {
    const ids = new Set(TEMPLATES.map((t) => t.id))
    for (const [id] of entries) expect(ids.has(id)).toBe(true)
  })

  it('cada plantilla sembrada tiene 3 paletas y todas son legibles', () => {
    for (const [id, t] of entries) {
      expect(t.palettes, id).toHaveLength(3)
      for (const p of t.palettes) expect(hasLegalPair(p), `${id} · ${p.map((c) => c.hex).join(',')}`).toBe(true)
    }
  })

  it('cada plantilla sembrada tiene containerType y un layout con bandas', () => {
    for (const [id, t] of entries) {
      expect(t.containerType.trim().length, id).toBeGreaterThan(0)
      expect(t.dna.layout.anatomy.length, id).toBeGreaterThanOrEqual(3)
      expect(t.dna.layout.anatomy.some((a) => /\(~\d+%\)/.test(a)), id).toBe(true)
    }
  })
})
