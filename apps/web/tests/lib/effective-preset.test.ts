import { describe, it, expect, beforeAll } from 'vitest'
import { refUrls, resolveEffectivePreset } from '@/lib/branding/effective-preset'
import { STYLE_PRESETS, getPreset } from '@/lib/branding/style-presets'
import type { BrandingSessionResponse } from '@/lib/branding/types'

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
     source_mode: 'preset', selected_palette: null, selected_typography: null,
     image_analysis: null, ...o } as BrandingSessionResponse)

describe('resolveEffectivePreset', () => {
  it('modo A default: devuelve el preset tal cual', () => {
    const id = Object.keys(STYLE_PRESETS)[0]
    const eff = resolveEffectivePreset(base({ style_id: id }))
    expect(eff.palette).toEqual(getPreset(id).palette)
    expect(eff.typography).toEqual(getPreset(id).typography)
  })

  it('modo A: identidad fija — ignora selected_palette/typography (columnas legadas)', () => {
    const id = Object.keys(STYLE_PRESETS)[0]
    const pal = [{ hex: '#111111', name: 'x', role: 'primary' as const },
                 { hex: '#222222', name: 'y', role: 'secondary' as const },
                 { hex: '#333333', name: 'z', role: 'accent' as const }]
    const eff = resolveEffectivePreset(base({ style_id: id, selected_palette: pal }))
    // paleta/tipografía SIEMPRE son las del preset, nunca los overrides legados
    expect(eff.palette).toEqual(getPreset(id).palette)
    expect(eff.composition).toEqual(getPreset(id).composition)
  })

  it('modo B: es solo un clasificador — devuelve el preset del bestFitStyleId, lo extraído se descarta', () => {
    const assignedId = Object.keys(STYLE_PRESETS)[0]
    const bestFitId = Object.keys(STYLE_PRESETS)[1]
    const extracted = {
      essence: 'E', keywords: ['k'], palette: [
        { hex: '#aaa000', name: 'a', role: 'primary' as const },
        { hex: '#bbb000', name: 'b', role: 'secondary' as const },
        { hex: '#ccc000', name: 'c', role: 'accent' as const }],
      typography: { primary: 'P', secondary: 'S', case: 'mixed' as const, detail: 'D' },
      materials: ['m'], composition: 'C', lighting: 'L', mood: ['mo'],
      motifs: ['mt'], avoid: ['av'], styleBlock: 'SB', bestFitStyleId: bestFitId,
    }
    const eff = resolveEffectivePreset(base({ source_mode: 'upload', style_id: assignedId, image_analysis: extracted }))
    // el preset devuelto es el del bestFitStyleId por completo, no el assignedId ni lo extraído
    expect(eff.id).toBe(getPreset(bestFitId).id)
    expect(eff.composition).toBe(getPreset(bestFitId).composition)
    expect(eff.palette).toEqual(getPreset(bestFitId).palette)
  })
})
