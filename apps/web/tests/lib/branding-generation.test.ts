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

  it('la etiqueta es un 360 con el frente a la izquierda y la letra chica atrás', () => {
    const p = buildPrompt('label', brief, preset, 'logo')
    expect(p).toContain('360')
    expect(p).toContain('FRONT panel on the LEFT half')
    expect(p).toContain('BACK panel on the RIGHT half')
    // El reparto es lo que evita que se amontone todo adelante.
    expect(p).toMatch(/BACK panel — everything else[\s\S]*ingredients/)
    expect(p).toMatch(/FRONT panel — only the hero/)
  })

  it('la etiqueta no inventa razón social ni dirección', () => {
    const p = buildPrompt('label', brief, preset, 'logo')
    expect(p).toContain('Do NOT invent legal or company data')
    expect(p).toContain('Fabricado por: ____________')
  })

  it('el mockup recibe el FRENTE y no muestra el dorso', () => {
    const p = buildPrompt('mockup', brief, preset, 'label')
    expect(p).toContain('FRONT panel of the finished label')
    expect(p).toContain('Do not redesign it')
    expect(p).toContain('back panel must NOT be visible')
  })

  it('logo cuadrado, mockup vertical, etiqueta apaisada (es un 360)', () => {
    expect(aspectFor('logo')).toBe('1:1')
    expect(aspectFor('mockup')).toBe('4:5')
    expect(aspectFor('label')).toBe('3:2')
  })
})
