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
})
