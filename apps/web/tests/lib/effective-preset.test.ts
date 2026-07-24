import { describe, it, expect, beforeAll } from 'vitest'
import { refUrls, resolveEffectivePreset, resolveEffectiveLayout } from '@/lib/branding/effective-preset'
import { STYLE_PRESETS, getPreset } from '@/lib/branding/style-presets'
import { getLayout } from '@/lib/branding/label-layouts'
import type { BrandingSessionResponse, ExtractedStyle } from '@/lib/branding/types'

beforeAll(() => { process.env.SUPABASE_URL = 'https://demo.supabase.co' })

describe('refUrls', () => {
  it('devuelve 5 URLs de storage por estilo, en el host del proyecto', () => {
    const firstId = Object.keys(STYLE_PRESETS)[0]
    const urls = refUrls(firstId)
    expect(urls).toHaveLength(5)
    expect(urls[0]).toMatch(/^https:\/\/demo\.supabase\.co\/storage\/v1\/object\/public\/ad-uploads\/branding-refs\//)
  })
})

// Nota: el brief usaba `require('@/lib/branding/style-presets').STYLE_PRESETS` mezclado
// con imports ESM. Bajo el vitest ESM de este repo `require` no está disponible en el
// scope del módulo de test, así que se usa el import ESM ya presente arriba en su lugar.
const base = (o: Partial<BrandingSessionResponse>): BrandingSessionResponse =>
  ({ style_id: Object.keys(STYLE_PRESETS)[0],
     source_mode: 'preset', image_analysis: null, ...o } as BrandingSessionResponse)

const extractedFixture = (bestFitId: string): ExtractedStyle => ({
  bestFitStyleId: bestFitId,
  essence: 'E',
  keywords: ['k'],
  palette: [
    { hex: '#FFFFFF', name: 'blanco', role: 'background' },
    { hex: '#111111', name: 'negro', role: 'primary' },
    { hex: '#FF0000', name: 'rojo', role: 'accent' },
  ],
  typography: { primary: 'serif', secondary: 'sans', case: 'uppercase', detail: 'x' },
  materials: ['vidrio'],
  composition: 'escena extraída',
  lighting: 'luz extraída',
  mood: ['sereno'],
  motifs: ['sello'],
  avoid: ['neón'],
  styleBlock: 'párrafo extraído',
  layout: {
    anatomy: ['banda superior (~30%): logo', 'banda inferior (~70%): datos'],
    logoPlacement: 'centrado arriba',
    dataBlock: 'al pie',
    margins: '6%',
    alignment: 'centered',
    avoidLayout: ['desorden'],
  },
})

describe('resolveEffectivePreset', () => {
  it('modo A default: devuelve el preset tal cual', () => {
    const id = Object.keys(STYLE_PRESETS)[0]
    const eff = resolveEffectivePreset(base({ style_id: id }))
    expect(eff.palette).toEqual(getPreset(id).palette)
    expect(eff.typography).toEqual(getPreset(id).typography)
  })

  it('modo B: es un EXTRACTOR — devuelve un preset ad-hoc con la identidad extraída de la imagen, no la de ningún preset fijo', () => {
    const assignedId = Object.keys(STYLE_PRESETS)[0]
    const bestFitId = Object.keys(STYLE_PRESETS)[1]
    const extracted = extractedFixture(bestFitId)
    const eff = resolveEffectivePreset(base({ source_mode: 'upload', style_id: assignedId, image_analysis: extracted }))
    // el preset devuelto es ad-hoc ('upload'), con la identidad EXTRAÍDA, no la del assignedId ni la del bestFitId
    expect(eff.id).toBe('upload')
    expect(eff.composition).toBe(extracted.composition)
    expect(eff.palette).toEqual(extracted.palette)
    expect(eff.styleBlock).toBe(extracted.styleBlock)
    expect(eff.referenceFolder).toBe('')
  })
})

describe('resolveEffectiveLayout', () => {
  it('modo A default: devuelve el layout fijo del estilo', () => {
    const id = Object.keys(STYLE_PRESETS)[0]
    const eff = resolveEffectiveLayout(base({ style_id: id }))
    expect(eff).toEqual(getLayout(id))
  })

  it('modo B: devuelve el layout EXTRAÍDO de la imagen, no el de ningún preset fijo', () => {
    const assignedId = Object.keys(STYLE_PRESETS)[0]
    const bestFitId = Object.keys(STYLE_PRESETS)[1]
    const extracted = extractedFixture(bestFitId)
    const eff = resolveEffectiveLayout(base({ source_mode: 'upload', style_id: assignedId, image_analysis: extracted }))
    expect(eff).toEqual(extracted.layout)
  })
})
