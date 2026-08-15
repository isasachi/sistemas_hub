import { describe, it, expect } from 'vitest'
import { hslToHex, hexToHsl, derivePalette, paletteFromBrand, moneyRamp, GOLD, COPPER } from './palette-derive'
import { contrastRatio } from '@/lib/branding/contrast'
import type { BrandSystem } from '@/lib/branding/brand-system'
import { NICHE_FALLBACK } from './niches'
import { BrandStyle } from './style-dna'

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
  it('son 4 iconos y todos se quedan en la familia del hue del producto', () => {
    const H = 215
    const p = derivePalette({ h: H, s: 82, l: 51 })
    expect(p.color_icon).toHaveLength(4)
    // Antes los offsets eran [0,40,130,220]: dos iconos caían del otro lado de la rueda y no
    // tenían relación con el producto. Ahora ninguno pasa de 90°.
    const dist = (a: number, b: number) => {
      const d = Math.abs(((a - b) % 360 + 360) % 360)
      return Math.min(d, 360 - d)
    }
    for (const hex of p.color_icon) expect(dist(hexToHsl(hex).h, H)).toBeLessThanOrEqual(90)
    // Y siguen siendo 4 tonos distintos entre sí.
    expect(new Set(p.color_icon).size).toBe(4)
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

  // Pedido del usuario 2026-08-07: los iconos pasteles deben salir de la marca. Antes eran el hue
  // del acento rotado 130° y 220°, o sea dos de los cuatro caían del otro lado de la rueda y no
  // eran colores de la marca.
  describe('iconos de card', () => {
    const hues = (p: ReturnType<typeof paletteFromBrand>) => p.color_icon.map((h) => hexToHsl(h).h)

    it('cada icono toma el tono de un color real de la paleta de marca', () => {
      const p = paletteFromBrand(brand())   // primary verde (h≈150) + accent naranja (h≈18)
      const marca = [hexToHsl('#2E7D5B').h, hexToHsl('#E85D2E').h]
      expect(hues(p).slice(0, 2).map(Math.round)).toEqual(marca.map(Math.round))
      expect(p.color_icon).toHaveLength(4)
    })

    it('NO usa el rol background como icono (es el fondo, no un acento)', () => {
      const p = paletteFromBrand(brand())
      const fondo = Math.round(hexToHsl('#1E1E2A').h)
      expect(hues(p).map(Math.round)).not.toContain(fondo)
    })

    it('las repeticiones se quedan en familia, no saltan al otro lado de la rueda', () => {
      // Marca de un solo color cromático: los 4 iconos salen de él, separados de a 25°.
      const unoSolo = brand({
        palette: [
          { hex: '#1E1E2A', name: 'Carbón', role: 'background' },
          { hex: '#2E7D5B', name: 'Verde', role: 'primary' },
        ],
      })
      const base = hexToHsl('#2E7D5B').h
      // Distancia sobre la rueda: el camino más corto entre dos tonos.
      const dist = (a: number, b: number) => {
        const d = Math.abs(((a - b) % 360 + 360) % 360)
        return Math.min(d, 360 - d)
      }
      // Todos a ≤90° del tono de marca. Los viejos offsets 130/220 daban 130° y 140°.
      for (const h of hues(paletteFromBrand(unoSolo))) expect(dist(h, base)).toBeLessThanOrEqual(90)
      expect(dist(base + 130, base)).toBeGreaterThan(90)   // el comportamiento viejo NO pasaría
    })

    it('descarta los casi-grises de la paleta (no dan un icono legible)', () => {
      const conGris = brand({
        palette: [
          { hex: '#1E1E2A', name: 'Carbón', role: 'background' },
          { hex: '#2E7D5B', name: 'Verde', role: 'primary' },
          { hex: '#E6E6E6', name: 'Gris', role: 'neutral' },
        ],
      })
      const gris = Math.round(hexToHsl('#E6E6E6').h)
      expect(hues(paletteFromBrand(conGris)).map(Math.round)).not.toContain(gris)
    })

    it('los 4 comparten luminosidad para leerse como un juego', () => {
      const ls = paletteFromBrand(brand()).color_icon.map((h) => hexToHsl(h).l)
      for (const l of ls) expect(l).toBeCloseTo(ls[0], 0)
    })
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

  // La banda de confianza lleva texto ENCIMA del metal y cruza todo el degradado, así que el peor
  // extremo es el que manda. El cobre viejo (#7A3B12→#C87137) daba 2.17:1 sobre su extremo oscuro.
  it('el texto sobre cualquiera de los dos metales es legible en sus DOS extremos', () => {
    for (const m of [GOLD, COPPER]) {
      expect(contrastRatio(m.on, m.dark), `${m.name} oscuro`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(m.on, m.light), `${m.name} claro`).toBeGreaterThanOrEqual(4.5)
    }
  })

  // Si el cobre cayera dentro de la banda que dispara el cambio, el reemplazo colisionaría con la
  // misma marca dorada que lo motivó.
  it('el cobre queda fuera de la banda de tono que se considera dorada', () => {
    for (const hex of [COPPER.dark, COPPER.light]) {
      const { h } = hexToHsl(hex)
      expect(h < 35 || h > 55, `${hex} hue=${Math.round(h)}`).toBe(true)
    }
    expect(moneyRamp({ color_accent: COPPER.light, color_headline: COPPER.dark })).toBe(GOLD)
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

// ─── El estilo modula el degradado de fondo (2026-08-15) ─────────────────────
// Medido en píxeles: el contraste de la escena NO responde al texto sobre la luz, responde a la
// distancia de luminosidad entre bg_start y bg_end — el prompt entrega esos dos hex como colores
// exactos, y dos casi-blancos son una pieza plana diga lo que diga la instrucción.
describe('bgDeltaL — el estilo decide el recorrido del degradado', () => {
  const L = (hex: string) => hexToHsl(hex).l
  const conEstilo = (b: BrandSystem, style: BrandStyle) => paletteFromBrand({ ...b, style })

  it('glass_premium y el ADN legado (sin estilo) dan la MISMA paleta de siempre, en ambas polaridades', () => {
    for (const b of [LIGHT_BRAND, brand()]) {
      expect(conEstilo(b, 'glass_premium')).toEqual(paletteFromBrand(b))
    }
  })

  it('un estilo de caída oscurece el borde inferior; uno de aire lo aclara', () => {
    const base = L(paletteFromBrand(LIGHT_BRAND).bg_start)
    expect(L(conEstilo(LIGHT_BRAND, 'bold_impact').bg_end)).toBeLessThan(base - 40)
    expect(L(conEstilo(LIGHT_BRAND, 'editorial_clean').bg_end)).toBeGreaterThan(base)
  })

  // Un extremo oscuro con la saturación aplastada a 15 es un gris muerto, no profundidad de marca.
  it('el extremo que oscurece conserva croma; el que aclara sigue desaturado como antes', () => {
    expect(hexToHsl(conEstilo(LIGHT_BRAND, 'bold_impact').bg_end).s).toBeGreaterThanOrEqual(35)
    // el tope real es 15; el margen absorbe el redondeo del viaje HSL→hex→HSL (da 15.07)
    expect(hexToHsl(conEstilo(LIGHT_BRAND, 'glass_premium').bg_end).s).toBeLessThan(16)
  })

  // La razón de mover SOLO el extremo de abajo: `fitHeadline` fija el titular contra `bg_start`.
  // Si el estilo tocara ese extremo, la garantía de contraste cambiaría con la dirección de arte.
  it('el titular no depende del estilo — bg_start no se toca, y el 7:1 aguanta', () => {
    for (const b of [LIGHT_BRAND, brand()]) {
      const ref = paletteFromBrand(b)
      for (const style of BrandStyle.options) {
        const p = conEstilo(b, style)
        expect(p.bg_start).toBe(ref.bg_start)
        expect(p.color_headline).toBe(ref.color_headline)
        expect(contrastRatio(p.color_headline, p.bg_start)).toBeGreaterThanOrEqual(7)
      }
    }
  })

  // El rebote existía para que una marca casi negra no diera un degradado de 1 punto. Con deltas
  // grandes se sale de rango mucho más seguido, así que tiene que seguir dando separación real.
  it('con delta grande y una marca casi negra, el rebote sigue dando un degradado visible', () => {
    const casiNegro = brand({ palette: [
      { hex: '#0B0B0F', name: 'Casi negro', role: 'background' },
      { hex: '#2E7D5B', name: 'Verde', role: 'primary' },
      { hex: '#E85D2E', name: 'Naranja', role: 'accent' },
    ] })
    for (const style of BrandStyle.options) {
      const p = conEstilo(casiNegro, style)
      expect(Math.abs(L(p.bg_end) - L(p.bg_start))).toBeGreaterThanOrEqual(4)
    }
  })
})
