import { describe, it, expect } from 'vitest'
import { buildPrompt, stageSequence, aspectFor, type Stage } from '@/lib/branding/generation'
import { getPreset } from '@/lib/branding/presets'
import type { Brief } from '@/lib/branding/brief'

const brief: Brief = {
  category: 'mascotas',
  productDescription: 'Snacks blandos de pollo para perros pequeños',
  brandName: 'Miru',
  audience: ['Dueños de perros'],
  presetId: 'soft_modern',
}
const preset = getPreset('soft_modern')
const STAGES: Stage[] = ['logo', 'mockup', 'label']

describe('orden de generación', () => {
  it('logo_first arranca por el logo; mockup_first por el mockup', () => {
    expect(stageSequence('logo_first')[0]).toBe('logo')
    expect(stageSequence('mockup_first')[0]).toBe('mockup')
  })

  it('las dos rutas producen las 3 piezas', () => {
    for (const order of ['logo_first', 'mockup_first'] as const) {
      expect(new Set(stageSequence(order))).toEqual(new Set(STAGES))
    }
  })
})

describe('prompts', () => {
  it('todos llevan el nombre de marca, la dirección del preset y su paleta', () => {
    for (const stage of STAGES) {
      const p = buildPrompt(stage, brief, preset, 'none')
      expect(p, stage).toContain('Miru')
      expect(p, stage).toContain(preset.promptStyle.slice(0, 40))
      expect(p, stage).toContain(preset.palette.primary)
    }
  })

  it('en mockup_first el logo se extrae del envase, no se reinventa', () => {
    const p = buildPrompt('logo', brief, preset, 'mockup')
    expect(p).toContain('lift its wordmark')
    expect(buildPrompt('logo', brief, preset, 'none')).not.toContain('lift its wordmark')
  })

  it('con logo ya generado, mockup y etiqueta lo tratan como adjunto a respetar', () => {
    for (const stage of ['mockup', 'label'] as Stage[]) {
      expect(buildPrompt(stage, brief, preset, 'logo')).toContain('FIRST attached image is the finished logo')
      expect(buildPrompt(stage, brief, preset, 'none')).not.toContain('finished logo')
    }
  })

  it('la etiqueta es arte plano, no un envase', () => {
    const p = buildPrompt('label', brief, preset, 'logo')
    expect(p).toContain('no mockup')
    expect(p).toContain('NOT applied to a container')
  })

  it('el logo es cuadrado y las otras dos verticales', () => {
    expect(aspectFor('logo')).toBe('1:1')
    expect(aspectFor('mockup')).toBe('4:5')
    expect(aspectFor('label')).toBe('4:5')
  })
})
