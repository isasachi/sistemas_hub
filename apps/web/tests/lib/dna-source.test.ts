import { describe, it, expect, vi } from 'vitest'
import type { BrandingSessionResponse, ExtractedStyle, PaletteColor } from '@/lib/branding/types'

// El manifiesto real se puebla con el seed (Task 7). Acá lo mockeamos para
// probar el resolver, no los datos: la integridad del manifiesto real la cubre
// branding-templates.test.ts.
//
// vi.hoisted es OBLIGATORIO: vi.mock se iza por encima de todo el módulo, así
// que su factory no puede cerrar sobre constantes declaradas con const abajo
// (daría ReferenceError). vi.hoisted sube estas definiciones con él.
const { PAL_A, PAL_B, DNA } = vi.hoisted(() => {
  const PAL_A = [
    { hex: '#FFFFFF', name: 'blanco', role: 'background' },
    { hex: '#111111', name: 'negro', role: 'primary' },
  ]
  const PAL_B = [
    { hex: '#F4EDE0', name: 'crema', role: 'background' },
    { hex: '#2B2420', name: 'tinta', role: 'primary' },
  ]
  const DNA = {
    essence: 'esencia de prueba',
    keywords: ['a', 'b', 'c'],
    palette: PAL_A,
    typography: { primary: 'serif', secondary: 'sans', case: 'uppercase', detail: 'espaciado' },
    materials: ['vidrio'],
    composition: 'frasco centrado',
    lighting: 'difusa cálida',
    mood: ['sereno'],
    motifs: ['filete'],
    avoid: ['neón'],
    styleBlock: 'Test packaging design language.',
    layout: {
      anatomy: ['banda de marca (~30%)', 'cuerpo (~50%)', 'datos (~20%)'],
      logoPlacement: 'centrado arriba',
      dataBlock: 'pie',
      margins: '8%',
      alignment: 'centered',
      avoidLayout: ['asimetría'],
    },
  }
  return { PAL_A, PAL_B, DNA }
}) as { PAL_A: PaletteColor[]; PAL_B: PaletteColor[]; DNA: ExtractedStyle }

vi.mock('@/lib/branding/template-dna', () => ({
  TEMPLATE_DNA: {
    'belleza/serum-facial': {
      dna: DNA,
      containerType: 'frasco de vidrio esmerilado con gotero',
      palettes: [PAL_A, PAL_B, PAL_B],
    },
  },
}))

const { resolveBrandDna, resolveLayout, sessionBrief } = await import('@/lib/branding/dna-source')

function session(o: Partial<BrandingSessionResponse>): BrandingSessionResponse {
  return {
    id: 's1', created_at: '', step: 2,
    brand_name: 'Lavíca', product_name: 'Nama', product_category: 'belleza',
    target_audience: null, personality: null, brief_notes: null,
    logo_options: null, logo_url: null,
    label_brief: null, label_data: null, label_url: null,
    container_mode: null, container_desc: null, container_url: null,
    mockup_url: null, mockup_options: null,
    source_mode: 'template', style_id: null, template_id: 'belleza/serum-facial',
    palette_variant: 0, palette_options: null,
    product_type: 'serum facial', descriptor: null, tagline: null, container_type: null,
    uploaded_image_url: null, image_analysis: null, uploaded_wireframe_url: null,
    preset_version: null, generation_status: null, generation_error: null,
    ...o,
  } as BrandingSessionResponse
}

describe('resolveBrandDna — modo plantilla', () => {
  it('devuelve el ADN de la plantilla con la paleta de la variante 0', () => {
    const dna = resolveBrandDna(session({ palette_variant: 0 }))
    expect(dna.styleBlock).toBe(DNA.styleBlock)
    expect(dna.palette).toEqual(PAL_A)
  })

  it('sustituye la paleta por la variante elegida', () => {
    expect(resolveBrandDna(session({ palette_variant: 1 })).palette).toEqual(PAL_B)
  })

  it('cae a la variante 0 si el índice está fuera de rango', () => {
    expect(resolveBrandDna(session({ palette_variant: 99 })).palette).toEqual(PAL_A)
    expect(resolveBrandDna(session({ palette_variant: null })).palette).toEqual(PAL_A)
  })

  it('lanza con una plantilla desconocida', () => {
    expect(() => resolveBrandDna(session({ template_id: 'no/existe' }))).toThrow(/Plantilla desconocida/)
  })

  it('resolveLayout devuelve el layout extraído de la plantilla', () => {
    expect(resolveLayout(session({})).alignment).toBe('centered')
  })
})

describe('resolveBrandDna — modo upload', () => {
  const up = { source_mode: 'upload' as const, template_id: null, image_analysis: DNA }

  it('usa el análisis de la imagen del usuario', () => {
    expect(resolveBrandDna(session(up)).styleBlock).toBe(DNA.styleBlock)
  })

  it('aplica la variante de paleta desde palette_options', () => {
    const s = session({ ...up, palette_options: [PAL_A, PAL_B], palette_variant: 1 })
    expect(resolveBrandDna(s).palette).toEqual(PAL_B)
  })

  it('usa la paleta del análisis cuando no hay palette_options', () => {
    expect(resolveBrandDna(session(up)).palette).toEqual(PAL_A)
  })

  it('lanza si el análisis está incompleto', () => {
    expect(() => resolveBrandDna(session({ ...up, image_analysis: null }))).toThrow(/análisis/)
  })
})

describe('sessionBrief', () => {
  it('marca sameProduct cuando el producto coincide con el de la plantilla', () => {
    expect(sessionBrief(session({ product_type: 'suero facial antiedad' })).sameProduct).toBe(true)
  })

  it('marca sameProduct=false cuando el producto es otro', () => {
    expect(sessionBrief(session({ product_type: 'rodillera deportiva' })).sameProduct).toBe(false)
  })

  it('en modo upload sameProduct es siempre true', () => {
    const s = session({ source_mode: 'upload', template_id: null, image_analysis: DNA, product_type: 'lo que sea' })
    expect(sessionBrief(s).sameProduct).toBe(true)
  })

  it('hereda el containerType de la plantilla cuando el producto es el mismo', () => {
    expect(sessionBrief(session({ container_type: null })).containerType)
      .toBe('frasco de vidrio esmerilado con gotero')
  })

  it('NO hereda el containerType de la plantilla cuando el producto es otro', () => {
    // Heredarlo pediría "una rodillera en un frasco con gotero" — se contradice
    // con la prohibición de copiar el envase de la referencia.
    const s = session({ product_type: 'rodillera deportiva', container_type: null })
    expect(sessionBrief(s).containerType).toBeUndefined()
  })

  it('el containerType del usuario gana siempre', () => {
    expect(sessionBrief(session({ container_type: 'tubo de aluminio' })).containerType)
      .toBe('tubo de aluminio')
    expect(sessionBrief(session({ product_type: 'rodillera', container_type: 'caja de cartón' })).containerType)
      .toBe('caja de cartón')
  })
})
