import { describe, it, expect } from 'vitest'
import { hslToHex, hexToHsl, derivePalette, paletteFromBrand, moneyRamp, GOLD, COPPER } from './palette-derive'
import { contrastRatio } from '@/lib/branding/contrast'
import type { BrandSystem } from '@/lib/branding/brand-system'
import { NICHE_FALLBACK } from './niches'

function brand(over: Partial<BrandSystem> = {}): BrandSystem {
  return {
    // Oscuro NORMAL (L≈14), no extremo: deja lugar para que el degradado se aleje del centro. Los
    // casi-negros, donde no hay lugar y el degradado rebota, viven en el test de magnitud.
    palette: [
      { hex: '#1E1E2A', name: 'Carbón', role: 'background' },
      { hex: '#2E7D5B', name: 'Verde bosque', role: 'primary' },
      { hex: '#E85D2E', name: 'Naranja', role: 'accent' },
    ],
    polarity: 'dark',
    font_family: 'Poppins',
    font_accent: null,
    halo: 'radial_soft',
    particles: 'medium',
    ...over,
  } as BrandSystem
}

const LIGHT_BRAND = brand({
  polarity: 'light',
  palette: [
    { hex: '#F5F1E8', name: 'Crema', role: 'background' },
    { hex: '#2E7D5B', name: 'Verde bosque', role: 'primary' },
    { hex: '#E85D2E', name: 'Naranja', role: 'accent' },
  ],
})

describe('derivePalette (spec 0.b B)', () => {
  it('hslToHex básico', () => {
    expect(hslToHex(0, 0, 100).toUpperCase()).toBe('#FFFFFF')
    expect(hslToHex(0, 0, 0)).toBe('#000000')
  })
  it('color_icon usa los offsets [0,40,130,220] y son 4', () => {
    const p = derivePalette({ h: 215, s: 82, l: 51 })
    expect(p.color_icon).toHaveLength(4)
  })
  it('garantiza contraste headline/bg_start ≥ 7:1 (QA#8) incluso con hue claro', () => {
    for (const base of [{ h: 55, s: 90, l: 60 }, { h: 215, s: 82, l: 51 }, { h: 140, s: 30, l: 40 }]) {
      const p = derivePalette(base)
      expect(contrastRatio(p.color_headline, p.bg_start)).toBeGreaterThanOrEqual(7)
    }
  })
  it('color_body es rgba con opacidad 0.7', () => {
    expect(derivePalette({ h: 215, s: 82, l: 51 }).color_body).toMatch(/^rgba\(.*0\.7\)$/)
  })
  it('color_surface siempre blanco', () => {
    expect(derivePalette({ h: 10, s: 50, l: 50 }).color_surface).toBe('#FFFFFF')
  })
  it('sin polaridad explícita es clara (comportamiento histórico)', () => {
    expect(derivePalette({ h: 215, s: 82, l: 51 }).polarity).toBe('light')
  })

  // Ampliación 2026-08-07: el camino sin branding también puede ser oscuro.
  describe('polaridad oscura sin marca', () => {
    const p = derivePalette({ h: 215, s: 82, l: 51 }, 'dark')

    it('invierte fondo y superficie', () => {
      expect(p.polarity).toBe('dark')
      expect(hexToHsl(p.bg_start).l).toBeLessThan(20)
      expect(hexToHsl(p.color_surface).l).toBeLessThan(30)
    })
    it('cumple 7:1 con titular claro (mismo bug de signo que en el camino de marca)', () => {
      expect(contrastRatio(p.color_headline, p.bg_start)).toBeGreaterThanOrEqual(7)
      expect(hexToHsl(p.color_headline).l).toBeGreaterThan(50)
    })
    it('mantiene la misma separación de degradado que el camino claro', () => {
      const claro = derivePalette({ h: 215, s: 82, l: 51 }, 'light')
      const delta = (t: typeof p) => Math.abs(hexToHsl(t.bg_end).l - hexToHsl(t.bg_start).l)
      expect(delta(p)).toBeCloseTo(delta(claro), 0)
      expect(delta(p)).toBeGreaterThanOrEqual(7.5)
    })
  })
})

describe('hexToHsl', () => {
  it('es la inversa de hslToHex', () => {
    for (const [h, s, l] of [[215, 82, 51], [0, 0, 100], [140, 30, 40]]) {
      const back = hexToHsl(hslToHex(h, s, l))
      expect(back.h).toBeCloseTo(h, 0)
      expect(back.s).toBeCloseTo(s, 0)
      expect(back.l).toBeCloseTo(l, 0)
    }
  })
  it('un gris no revienta la división por cero', () => {
    expect(hexToHsl('#808080')).toMatchObject({ h: 0, s: 0 })
  })
})

describe('paletteFromBrand (decisión #2 opción A: mapeo por roles)', () => {
  it('usa los hex LITERALES de la marca en fondo y acento', () => {
    const p = paletteFromBrand(LIGHT_BRAND)
    expect(p.bg_start).toBe('#F5F1E8')
    expect(p.color_accent).toBe('#E85D2E')
  })

  // Esta es LA prueba de la decisión #9. La versión vieja del loop siempre restaba L: sobre fondo
  // oscuro empeoraba en cada vuelta y devolvía ~1.5:1 sin error. Si alguien reintroduce ese signo,
  // este test lo caza.
  it('garantiza 7:1 también sobre fondo OSCURO (el loop invierte el signo)', () => {
    const p = paletteFromBrand(brand())
    expect(p.polarity).toBe('dark')
    expect(contrastRatio(p.color_headline, p.bg_start)).toBeGreaterThanOrEqual(7)
    // Sobre fondo oscuro el titular tiene que ser CLARO, no oscuro.
    expect(hexToHsl(p.color_headline).l).toBeGreaterThan(50)
  })

  it('garantiza 7:1 sobre fondo claro', () => {
    const p = paletteFromBrand(LIGHT_BRAND)
    expect(contrastRatio(p.color_headline, p.bg_start)).toBeGreaterThanOrEqual(7)
    expect(hexToHsl(p.color_headline).l).toBeLessThan(50)
  })

  // Superficie blanca al 80% + titular claro = texto claro sobre blanco. La superficie sigue a la
  // polaridad para que la card no se vuelva ilegible.
  it('la superficie sigue a la polaridad', () => {
    expect(paletteFromBrand(LIGHT_BRAND).color_surface).toBe('#FFFFFF')
    expect(hexToHsl(paletteFromBrand(brand()).color_surface).l).toBeLessThan(30)
  })

  // Con lugar, el degradado se aleja del centro (oscuro→más oscuro, claro→más claro). El fixture
  // claro de arriba (crema L≈94) NO tiene lugar y rebota a propósito: eso lo cubre el test de
  // magnitud. La invariante dura es la SEPARACIÓN, no la dirección.
  it('con headroom, el degradado se aleja hacia el extremo de la polaridad', () => {
    const oscuro = paletteFromBrand(brand())                                   // L≈14
    const claro = paletteFromBrand(brand({                                     // L≈85
      polarity: 'light',
      palette: [{ hex: '#A8C8E8', name: 'Celeste', role: 'background' }, { hex: '#2E7D5B', name: 'Verde', role: 'primary' }],
    }))
    expect(hexToHsl(oscuro.bg_end).l).toBeLessThan(hexToHsl(oscuro.bg_start).l)
    expect(hexToHsl(claro.bg_end).l).toBeGreaterThan(hexToHsl(claro.bg_start).l)
  })

  // El signo no alcanza: un `max(4, l-8)` sobre una marca casi negra daba L5→L4 — técnicamente
  // "más oscuro", visualmente el fondo plano que el prompt prohíbe. Lo que importa es la MAGNITUD.
  it('mantiene separación real de L aun en los extremos (nada de fondo plano)', () => {
    const extremos = [
      brand({ palette: [{ hex: '#000000', name: 'Negro', role: 'background' }, { hex: '#2E7D5B', name: 'Verde', role: 'primary' }] }),
      brand({ palette: [{ hex: '#0B0B0F', name: 'Casi negro', role: 'background' }, { hex: '#2E7D5B', name: 'Verde', role: 'primary' }] }),
      brand({ polarity: 'light', palette: [{ hex: '#FFFFFF', name: 'Blanco', role: 'background' }, { hex: '#2E7D5B', name: 'Verde', role: 'primary' }] }),
    ]
    for (const b of extremos) {
      const p = paletteFromBrand(b)
      const delta = Math.abs(hexToHsl(p.bg_end).l - hexToHsl(p.bg_start).l)
      expect(delta, `${p.bg_start} → ${p.bg_end}`).toBeGreaterThanOrEqual(7.5)
    }
  })

  // Sin rol accent, caer al primary borraría el énfasis: el titular ya sale del primary.
  it('sintetiza un acento distinto del titular cuando la marca no trae rol accent', () => {
    const sinAccent = brand({
      palette: [
        { hex: '#0B0B0F', name: 'Negro', role: 'background' },
        { hex: '#2E7D5B', name: 'Verde bosque', role: 'primary' },
      ],
    })
    const p = paletteFromBrand(sinAccent)
    expect(p.color_accent).not.toBe(p.color_headline)
    expect(hexToHsl(p.color_accent).h).not.toBeCloseTo(hexToHsl('#2E7D5B').h, 0)
  })

  it('sin rol primary cae al accent y sigue cumpliendo contraste', () => {
    const sinPrimary = brand({
      palette: [
        { hex: '#0B0B0F', name: 'Negro', role: 'background' },
        { hex: '#E85D2E', name: 'Naranja', role: 'accent' },
      ],
    })
    expect(contrastRatio(paletteFromBrand(sinPrimary).color_headline, '#1E1E2A')).toBeGreaterThanOrEqual(7)
  })
})

describe('moneyRamp (decisión #6)', () => {
  const tokens = (accent: string, headline = '#111111') =>
    ({ color_accent: accent, color_headline: headline })

  it('mantiene el oro con una marca que no es dorada', () => {
    expect(moneyRamp(tokens('#E85D2E'))).toBe(GOLD)   // naranja
    expect(moneyRamp(tokens('#2E7D5B'))).toBe(GOLD)   // verde
    expect(moneyRamp(tokens('#1E6FE8'))).toBe(GOLD)   // azul
  })
  it('se corre a cobre cuando la marca ES dorada (si no, marca y oro se confunden)', () => {
    expect(moneyRamp(tokens('#D4A017'))).toBe(COPPER)
  })
  it('un dorado desaturado no dispara el cambio', () => {
    expect(moneyRamp(tokens('#8C8574'))).toBe(GOLD)
  })

  // Caso REAL del probe 2026-08-07: la marca "Protin" tiene primary dorado #BD9E4D y accent rojo.
  // Mirando solo el acento el oro no se corría y quedaba idéntico al color dominante de la marca.
  it('dispara aunque el dorado esté en el titular y no en el acento (caso Protin)', () => {
    expect(moneyRamp(tokens('#C20A2F', '#BD9E4D'))).toBe(COPPER)
  })

  // ⚠️ DESVIACIÓN CONSCIENTE de la decisión #6, que hablaba de "si la MARCA es dorada". El umbral
  // mira el hex del acento, así que también dispara en el camino SIN marca: `haircare` (hue 35) y
  // `jewelry_fashion` (hue 45) sintetizan acentos dentro de la banda dorada. Se dejó así porque la
  // colisión que motiva la regla (marca y oro indistinguibles) es idéntica venga de donde venga el
  // color. Para restringirlo solo al camino de marca, hay que pasarle esa señal a moneyRamp.
  it('también corre en el camino SIN marca para nichos de hue dorado', () => {
    for (const n of ['haircare', 'jewelry_fashion'] as const) {
      expect(moneyRamp(derivePalette({ h: NICHE_FALLBACK[n].hue, s: 80, l: 50 })), n).toBe(COPPER)
    }
    expect(moneyRamp(derivePalette({ h: NICHE_FALLBACK.skincare_topical.hue, s: 80, l: 50 }))).toBe(GOLD)
  })
})
