import { describe, it, expect } from 'vitest'
import { nextTier, venció, TIER_HORAS, type EstadoAnunciante } from './tiers'
import { extraerTerminos, esTerminoUtil, ngramas, idf, debePodarse } from '../vocab/terms'
import { repartoCiclo } from './budget'

const adv = (o: Partial<EstadoAnunciante> = {}): EstadoAnunciante =>
  ({ tier: 'warm', adCountPrevio: 50, consecutiveMisses: 0, ...o })

describe('recrawl adaptativo (spec §9)', () => {
  it('sumando anuncios y monoproducto → hot', () => {
    expect(nextTier(adv(), { activeAds: 70, monoRatio: 0.8 }).tier).toBe('hot')
  })

  it('sumando anuncios pero sin monoproducto → warm, no hot', () => {
    expect(nextTier(adv(), { activeAds: 70, monoRatio: 0.3 }).tier).toBe('warm')
  })

  it('perdiendo anuncios → cold', () => {
    expect(nextTier(adv(), { activeAds: 20, monoRatio: 0.9 }).tier).toBe('cold')
  })

  it('quieto: un hot baja un escalón, el resto cae a cold', () => {
    expect(nextTier(adv({ tier: 'hot' }), { activeAds: 50, monoRatio: 0.9 }).tier).toBe('warm')
    expect(nextTier(adv({ tier: 'warm' }), { activeAds: 50, monoRatio: 0.9 }).tier).toBe('cold')
  })

  it('sin anuncios una vez es cold; dos veces seguidas, cuarentena', () => {
    const uno = nextTier(adv(), { activeAds: 0, monoRatio: 0 })
    expect(uno).toEqual({ tier: 'cold', consecutiveMisses: 1 })
    const dos = nextTier(adv({ consecutiveMisses: 1 }), { activeAds: 0, monoRatio: 0 })
    expect(dos.tier).toBe('quarantine')
  })

  it('sin anuncios estando en cuarentena → archived: así salen los viejos', () => {
    expect(nextTier(adv({ tier: 'quarantine', consecutiveMisses: 1 }), { activeAds: 0, monoRatio: 0 }).tier)
      .toBe('archived')
  })

  it('un anunciante que vuelve a tener anuncios resetea los fallos', () => {
    expect(nextTier(adv({ consecutiveMisses: 1 }), { activeAds: 10, monoRatio: 0.9 }).consecutiveMisses).toBe(0)
  })
})

describe('vencimiento por tier', () => {
  const ahora = Date.parse('2026-08-22T12:00:00Z')
  const haceHoras = (h: number) => new Date(ahora - h * 3_600_000).toISOString()

  it('nunca auditado vence siempre', () => {
    expect(venció('cold', null, ahora)).toBe(true)
  })

  it('archived NO vence: salió del inventario activo', () => {
    expect(venció('archived', null, ahora)).toBe(false)
  })

  it('respeta el intervalo de cada tier', () => {
    expect(venció('hot', haceHoras(TIER_HORAS.hot - 1), ahora)).toBe(false)
    expect(venció('hot', haceHoras(TIER_HORAS.hot + 1), ahora)).toBe(true)
    expect(venció('cold', haceHoras(TIER_HORAS.hot + 1), ahora)).toBe(false)
  })
})

describe('presupuesto descubrimiento vs mantenimiento (spec §9)', () => {
  // Sin la separación, el recrawl se come toda la capacidad conforme crece el
  // inventario y el motor deja de descubrir.
  it('reparte 60/40', () => {
    expect(repartoCiclo(20)).toEqual({ descubrir: 12, recrawl: 8 })
  })

  it('con capacidad chica el descubrimiento nunca queda en cero', () => {
    expect(repartoCiclo(1).descubrir).toBeGreaterThanOrEqual(1)
  })

  it('nunca reparte más de la capacidad', () => {
    for (const n of [1, 2, 3, 7, 13, 100]) {
      const r = repartoCiclo(n)
      expect(r.descubrir + r.recrawl).toBeLessThanOrEqual(n)
    }
  })
})

describe('vocabulario auto-alimentado (spec §10)', () => {
  it('extrae tipo, tags y n-gramas del nombre', () => {
    const t = extraerTerminos({
      productType: 'Rodilleras',
      productTags: ['soporte', 'deportivo'],
      productName: 'Rodillera ActiveLife',
    })
    const terminos = t.map((x) => x.term)
    expect(terminos).toContain('rodilleras')   // product_type: la categoría del comerciante
    expect(terminos).toContain('soporte')      // tag
    expect(terminos).toContain('rodillera activelife')
    // `rodillera` a secas NO: del nombre solo salen bigramas (ver el test de abajo).
    expect(terminos).not.toContain('rodillera')
  })

  it('descarta la marca: buscarla solo devuelve a ese anunciante', () => {
    const t = extraerTerminos({ productName: 'Bnatural', brand: 'bnatural' })
    expect(t.map((x) => x.term)).not.toContain('bnatural')
  })

  it('descarta fragmentos que empiezan o terminan en palabra vacía', () => {
    // Medido sobre las 137 landings reales: sin esto entraron al vocabulario
    // `para`, `con`, `tus`, `obten`, `y adoloridos` y `de pies`, y cada término
    // es una búsqueda PAGADA contra Meta.
    expect(esTerminoUtil('para')).toBe(false)
    expect(esTerminoUtil('de pies')).toBe(false)
    expect(esTerminoUtil('y adoloridos')).toBe(false)
    expect(esTerminoUtil('obten')).toBe(false)
    // Una palabra vacía EN EL MEDIO no descalifica: es un término real.
    expect(esTerminoUtil('aceite de coco')).toBe(true)
    expect(esTerminoUtil('crema para pies')).toBe(true)
  })

  it('del NOMBRE solo salen n-gramas de dos palabras', () => {
    // Medido: de 485 términos auto-extraídos activos, 383 eran de una sola
    // palabra — `and`, `the`, `pro`, `100ml`, marcas sueltas — y cada uno es una
    // búsqueda pagada. Las palabras sueltas buenas (`faja`, `rodillera`) ya
    // viven dentro de una semilla, así que no descubren un nicho nuevo.
    const t = extraerTerminos({ productName: 'Cinturon Termico Lumbar' }).map((x) => x.term)
    expect(t).toContain('cinturon termico')
    expect(t).toContain('termico lumbar')
    expect(t).not.toContain('cinturon')
    expect(t).not.toContain('termico')
  })

  it('el product_type SÍ puede ser una palabra: es la categoría del comerciante', () => {
    expect(extraerTerminos({ productType: 'Rodilleras' }).map((x) => x.term)).toContain('rodilleras')
  })

  it('descarta términos con un número suelto', () => {
    // "30 capsulas", "1 par", "2 0" salen de los títulos de packaging.
    expect(esTerminoUtil('30 capsulas')).toBe(false)
    expect(esTerminoUtil('1 par')).toBe(false)
    // Un número PEGADO a la palabra no es lo mismo: "omega3" es un producto.
    expect(esTerminoUtil('omega3 vegetal')).toBe(true)
  })

  it('descarta ruido de packaging y números sueltos', () => {
    expect(esTerminoUtil('ml')).toBe(false)
    expect(esTerminoUtil('240')).toBe(false)
    expect(esTerminoUtil('oferta')).toBe(false)
    expect(esTerminoUtil('rodillera')).toBe(true)
  })

  it('no repite un término que llega por dos caminos', () => {
    const t = extraerTerminos({ productType: 'rodillera', productName: 'Rodillera Pro' })
    expect(t.filter((x) => x.term === 'rodillera')).toHaveLength(1)
  })

  it('los n-gramas son de 1 y 2 palabras, en orden', () => {
    expect(ngramas('faja lumbar ortopedica'))
      .toEqual(['faja', 'faja lumbar', 'lumbar', 'lumbar ortopedica', 'ortopedica'])
  })

  it('idf premia lo raro', () => {
    expect(idf(1000, 20)).toBeGreaterThan(idf(1000, 900))
  })

  it('la poda exige haber corrido lo suficiente en TODOS los países', () => {
    // Rinde en uno solo: no se poda. Apagarlo lo mataría en los otros cinco.
    expect(debePodarse([
      { runs: 9, yieldRate: 0 },
      { runs: 9, yieldRate: 0.4 },
    ])).toBe(false)
    expect(debePodarse([{ runs: 9, yieldRate: 0 }, { runs: 9, yieldRate: 0 }])).toBe(true)
    // Poco corrido: todavía no hay evidencia para apagarlo.
    expect(debePodarse([{ runs: 2, yieldRate: 0 }])).toBe(false)
  })
})
