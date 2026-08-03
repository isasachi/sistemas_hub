import { describe, it, expect } from 'vitest'
import { buildPrompt, STAGE_SEQUENCE, aspectFor, type Stage } from '@/lib/branding/generation'
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
  it('va en cascada logo → etiqueta → mockup', () => {
    expect(STAGE_SEQUENCE).toEqual(['logo', 'label', 'mockup'])
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

  it('la etiqueta trata al logo como adjunto a respetar', () => {
    expect(buildPrompt('label', brief, preset, 'logo')).toContain('FIRST attached image is the finished logo')
    expect(buildPrompt('label', brief, preset, 'none')).not.toContain('finished logo')
  })

  it('el mockup aplica la etiqueta ya generada, no la reinventa', () => {
    const p = buildPrompt('mockup', brief, preset, 'label')
    expect(p).toContain('finished label artwork')
    expect(p).toContain('Do not redesign it')
  })

  it('el envase: el elegido manda; sin elegir, lo decide el motor', () => {
    const conEnvase = buildPrompt('mockup', { ...brief, containerType: 'Doypack' }, preset, 'label')
    expect(conEnvase).toContain('The container MUST be: Doypack')
    expect(buildPrompt('mockup', brief, preset, 'label')).toContain('best fits')
    expect(buildPrompt('label', { ...brief, containerType: 'Doypack' }, preset, 'logo')).toContain('Doypack')
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
