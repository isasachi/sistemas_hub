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
     source_mode: 'preset', image_analysis: null, ...o } as BrandingSessionResponse)

describe('resolveEffectivePreset', () => {
  it('modo A default: devuelve el preset tal cual', () => {
    const id = Object.keys(STYLE_PRESETS)[0]
    const eff = resolveEffectivePreset(base({ style_id: id }))
    expect(eff.palette).toEqual(getPreset(id).palette)
    expect(eff.typography).toEqual(getPreset(id).typography)
  })

  it('modo B: es solo un clasificador — devuelve el preset del bestFitStyleId, lo extraído se descarta', () => {
    const assignedId = Object.keys(STYLE_PRESETS)[0]
    const bestFitId = Object.keys(STYLE_PRESETS)[1]
    const extracted = { essence: 'E', keywords: ['k'], bestFitStyleId: bestFitId }
    const eff = resolveEffectivePreset(base({ source_mode: 'upload', style_id: assignedId, image_analysis: extracted }))
    // el preset devuelto es el del bestFitStyleId por completo, no el assignedId ni lo extraído
    expect(eff.id).toBe(getPreset(bestFitId).id)
    expect(eff.composition).toBe(getPreset(bestFitId).composition)
    expect(eff.palette).toEqual(getPreset(bestFitId).palette)
  })
})
