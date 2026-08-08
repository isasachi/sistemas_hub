import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gemini', () => ({
  callStructured: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  fetchAsBase64: vi.fn().mockResolvedValue({ data: 'AAAA', mimeType: 'image/png' }),
}))

import { callStructured } from '@/lib/gemini'
import { extractDna } from './extract-dna'
import { derivePalette } from './palette-derive'
import { assignPoses, NO_TALENT_SUBSTITUTE } from './demographics'
import { NICHE_TYPOGRAPHY, NICHE_FALLBACK } from './niches'
import type { LandingSessionResponse, SectionType } from './types'

function baseSession(overrides?: Partial<LandingSessionResponse>): LandingSessionResponse {
  return {
    product_photo_urls: ['https://example.com/photo.png'],
    product_labels: 'Marca X, 60 cápsulas, cúrcuma + jengibre',
    ...overrides,
  } as unknown as LandingSessionResponse
}

describe('extractDna', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ensambla el DNA con la paleta DERIVADA (no el color crudo), tipografía del nicho y poses asignadas', async () => {
    const extraction = {
      brand_base: { hex: '#1E6FE8', h: 215, s: 82, l: 51 },
      particle_type: 'burbujas translúcidas y destellos de luz sobre agua',
      particle_density: 'medium' as const,
      props: ['raíz de cúrcuma cortada', 'hojas verdes frescas'],
    }
    vi.mocked(callStructured).mockResolvedValueOnce(extraction)

    const niche = 'supplement_skin_female' as const
    const demographic = 'female_18_30' as const
    const order: SectionType[] = ['hero', 'beneficios', 'cta-final']

    const dna = await extractDna(baseSession(), niche, demographic, order)

    expect(dna.brand_base).toEqual(extraction.brand_base)
    // La paleta NUNCA es el color crudo — siempre pasa por derivePalette (fórmula).
    expect(dna.palette).toEqual(derivePalette(extraction.brand_base))
    expect(dna.palette).not.toEqual(extraction.brand_base)
    expect(dna.font_family).toBe(NICHE_TYPOGRAPHY[niche].font_family)
    expect(dna.font_accent).toBe(NICHE_TYPOGRAPHY[niche].font_accent)
    expect(dna.halo).toBe(NICHE_FALLBACK[niche].halo)
    expect(dna.poses).toEqual(assignPoses(order, demographic))
    expect(dna.particle_type).toBe(extraction.particle_type)
    expect(dna.particle_density).toBe(extraction.particle_density)
    expect(dna.props).toEqual(extraction.props)
  })

  // ── Decisión #4 (2026-08-07): con sistema de marca, la MARCA gana sobre el nicho ──
  describe('precedencia marca → nicho', () => {
    // Nicho elegido a propósito para que TODO choque con la marca: skincare da hue 340 (rosa),
    // Inter/Playfair, halo radial_soft y partículas encendidas.
    const niche = 'skincare_topical' as const
    const brand_system = {
      palette: [
        { hex: '#0B0B0F', name: 'Negro humo', role: 'background' },
        { hex: '#2E7D5B', name: 'Verde bosque', role: 'primary' },
        { hex: '#E85D2E', name: 'Naranja', role: 'accent' },
      ],
      polarity: 'dark',
      font_family: 'Oswald',
      font_accent: 'Anton',
      halo: 'rim',
      particles: 'none',
    } as unknown as LandingSessionResponse['brand_system']

    const extraction = {
      brand_base: { hex: '#1E6FE8', h: 215, s: 82, l: 51 },
      particle_type: 'gotas de sérum en suspensión',
      particle_density: 'high' as const,
      props: ['pétalos', 'gotero de vidrio'],
    }

    async function dnaConMarca() {
      vi.mocked(callStructured).mockResolvedValueOnce(extraction)
      return extractDna(baseSession({ brand_system }), niche, 'female_18_30', ['hero'])
    }

    it('la paleta sale del mapeo por roles de la marca, no de la fórmula del hue', async () => {
      const dna = await dnaConMarca()
      expect(dna.palette.bg_start).toBe('#0B0B0F')
      expect(dna.palette.color_accent).toBe('#E85D2E')
      expect(dna.palette.polarity).toBe('dark')
      expect(dna.palette).not.toEqual(derivePalette(extraction.brand_base))
    })

    it('la tipografía y el halo de la marca pisan a los del nicho', async () => {
      const dna = await dnaConMarca()
      expect(dna.font_family).toBe('Oswald')
      expect(dna.font_accent).toBe('Anton')
      expect(dna.halo).toBe('rim')
      expect(dna.font_family).not.toBe(NICHE_TYPOGRAPHY[niche].font_family)
      expect(dna.halo).not.toBe(NICHE_FALLBACK[niche].halo)
    })

    it('particles:none apaga las partículas aunque el nicho las tenga encendidas', async () => {
      expect(NICHE_FALLBACK[niche].particles_on).toBe(true)
      expect((await dnaConMarca()).particles_on).toBe(false)
    })

    // La marca manda el ESTILO, no los HECHOS: props y tipo de partícula salen de los ingredientes
    // y el material del envase. Pisarlos rompería las reglas de fidelidad de producto.
    it('NO pisa los props ni el tipo de partícula (son fácticos, no estilísticos)', async () => {
      const dna = await dnaConMarca()
      expect(dna.props).toEqual(extraction.props)
      expect(dna.particle_type).toBe(extraction.particle_type)
    })

    it('sin marca todo sigue saliendo del nicho (producto suelto)', async () => {
      vi.mocked(callStructured).mockResolvedValueOnce(extraction)
      const dna = await extractDna(baseSession(), niche, 'female_18_30', ['hero'])
      expect(dna.font_family).toBe(NICHE_TYPOGRAPHY[niche].font_family)
      expect(dna.halo).toBe(NICHE_FALLBACK[niche].halo)
      expect(dna.palette).toEqual(derivePalette(extraction.brand_base))
      expect(dna.palette.polarity).toBe('light')
    })
  })

  it('usa NO_TALENT_SUBSTITUTE como model_persona cuando demographic_id es no_talent', async () => {
    const extraction = {
      brand_base: { hex: '#1E6FE8', h: 215, s: 82, l: 51 },
      particle_type: 'partículas geométricas',
      particle_density: 'low' as const,
      props: ['cable', 'superficie mate'],
    }
    vi.mocked(callStructured).mockResolvedValueOnce(extraction)
    const niche = 'tech_gadgets' as const
    const dna = await extractDna(baseSession(), niche, 'no_talent', ['hero'])
    expect(dna.model_persona).toBe(NO_TALENT_SUBSTITUTE[niche])
  })

  it('propaga particles_on del nicho al DNA', async () => {
    const dna = await extractDna(baseSession(), 'home_cleaning', 'no_talent', ['hero'])
    expect(typeof dna.particles_on).toBe('boolean')
  })

  it('brand_base.s < 12 dispara el fallback de hue del Anexo C (envase blanco/negro/plateado)', async () => {
    const extraction = {
      brand_base: { hex: '#FDFDFD', h: 0, s: 4, l: 98 },
      particle_type: 'motas suaves',
      particle_density: 'low' as const,
      props: ['algo real'],
    }
    vi.mocked(callStructured).mockResolvedValueOnce(extraction)
    const niche = 'tech_gadgets' as const
    const dna = await extractDna(baseSession(), niche, 'no_talent', ['hero'])
    expect(dna.brand_base.h).toBe(NICHE_FALLBACK[niche].hue)
    expect(dna.brand_base.s).toBe(70)
    expect(dna.brand_base.l).toBe(50)
    expect(dna.palette).toEqual(derivePalette(dna.brand_base))
    // El resto de la extracción (partículas/props válidos) NO se pisa — solo el color cae.
    expect(dna.particle_type).toBe(extraction.particle_type)
    expect(dna.props).toEqual(extraction.props)
  })

  it('particle_type/props vacíos caen al fallback del Anexo C aunque el color sea válido', async () => {
    const extraction = {
      brand_base: { hex: '#1E6FE8', h: 215, s: 82, l: 51 },
      particle_type: '',
      particle_density: 'medium' as const,
      props: [],
    }
    vi.mocked(callStructured).mockResolvedValueOnce(extraction)
    const niche = 'pets' as const
    const dna = await extractDna(baseSession(), niche, 'no_talent', ['hero'])
    expect(dna.particle_type).toBe(NICHE_FALLBACK[niche].particles)
    expect(dna.props).toEqual([NICHE_FALLBACK[niche].propsFamily])
    // El color sigue siendo el de la visión (no dispara el fallback de hue).
    expect(dna.brand_base).toEqual(extraction.brand_base)
  })

  it('si callStructured lanza (visión falla), cae al fallback COMPLETO del Anexo C y valida', async () => {
    vi.mocked(callStructured).mockRejectedValueOnce(new Error('gemini down'))
    const niche = 'pets' as const
    const demographic = 'no_talent' as const
    const order: SectionType[] = ['hero', 'cta-final']

    const dna = await extractDna(baseSession(), niche, demographic, order)

    expect(dna.brand_base.h).toBe(NICHE_FALLBACK[niche].hue)
    expect(dna.brand_base.s).toBe(70)
    expect(dna.brand_base.l).toBe(50)
    expect(dna.palette).toEqual(derivePalette(dna.brand_base))
    expect(dna.particle_type).toBe(NICHE_FALLBACK[niche].particles)
    expect(dna.particle_density).toBe(NICHE_FALLBACK[niche].particle_density)
    expect(dna.props).toEqual([NICHE_FALLBACK[niche].propsFamily])
    expect(dna.font_family).toBe(NICHE_TYPOGRAPHY[niche].font_family)
    expect(dna.halo).toBe(NICHE_FALLBACK[niche].halo)
    expect(dna.model_persona).toBe(NO_TALENT_SUBSTITUTE[niche])
    expect(dna.poses).toEqual(assignPoses(order, demographic))
  })
})
