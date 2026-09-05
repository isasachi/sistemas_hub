import { describe, it, expect } from 'vitest'
import { buildIdentityInstruction, buildCharacterParts, CharacterIdentitySchema, ACENTO_PENDIENTE } from './character'
import type { UserInputs } from './types'
import type { ForensicReport } from './forensic'

const INPUTS: UserInputs = {
  productName: 'Serum Eunoia', productDescription: 'Suero', angle: 'Testimonio',
  targetAudience: 'Mujeres 20-35', problem: 'Marcas de acné',
  characterDesc: 'Mujer de 25, cabello negro recogido, piel clara, ojos claros',
  characterEthnicity: 'Latina peruana', accent: 'Español peruano de Lima',
  voice: 'Femenina joven, ritmo conversacional', constraints: '',
}
const FORENSIC = { sujeto: 'Mujer joven de cabello oscuro', vestuario: 'Polo azul', fondo: 'Dormitorio' } as ForensicReport

describe('buildIdentityInstruction', () => {
  it('prohíbe los cuatro atajos de identidad que el spec lista', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, false)
    expect(p).toMatch(/el mismo personaje/i)
    expect(p).toMatch(/igual al anterior/i)
    expect(p).toMatch(/idéntica persona/i)
    expect(p).toMatch(/as before/i)
    expect(p).toMatch(/no.*reemplac/i)
  })

  it('usa la etnia y el acento del usuario, literales', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, false)
    expect(p).toContain('Latina peruana')
    expect(p).toContain('Español peruano de Lima')
  })

  it('marca el acento pendiente en vez de poner uno genérico', () => {
    const p = buildIdentityInstruction({ ...INPUTS, accent: '' }, FORENSIC, false)
    expect(p).toContain(ACENTO_PENDIENTE)
  })

  it('no marca el acento como pendiente cuando el usuario sí lo confirmó', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, false)
    expect(p).not.toContain(ACENTO_PENDIENTE)
  })

  it('con imagen de referencia manda observar, no inventar', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, true)
    expect(p).toMatch(/imagen de referencia/i)
    expect(p).toMatch(/no inventes/i)
  })

  it('con imagen, prohíbe inferir etnia o acento de la foto (mismo guard que sin imagen)', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, true)
    expect(p).toMatch(/nunca infieras de la foto la etnia/i)
    expect(p).toMatch(/exclusivamente del usuario/i)
  })

  it('prohíbe overlays en la imagen del personaje', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, false)
    expect(p).toMatch(/sin texto|no text/i)
  })

  it('pide 2:3 en el prompt de creación, no 9:16 — coincide con la llamada a gpt-image-2', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC, false)
    expect(p).toMatch(/2:3/)
    expect(p).not.toMatch(/9:16/)
  })
})

describe('buildCharacterParts', () => {
  it('sin imagen: un único part de texto', () => {
    const parts = buildCharacterParts('instrucción')
    expect(parts).toEqual([{ text: 'instrucción' }])
  })

  it('con imagen: el part de imagen va ANTES del de texto', () => {
    const parts = buildCharacterParts('instrucción', { data: 'YQ==', mimeType: 'image/png' })
    expect(parts).toHaveLength(2)
    expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/png', data: 'YQ==' } })
    expect(parts[1]).toEqual({ text: 'instrucción' })
  })
})

describe('CharacterIdentitySchema', () => {
  it('acepta una identidad completa', () => {
    const ok = CharacterIdentitySchema.safeParse({
      promptCreacion: 'Retrato vertical de mujer de 25 años, cabello negro...',
      bloqueConsistencia: 'Mujer de 25 años, latina peruana, cabello negro liso recogido en moño bajo, piel clara, ojos marrón claro, complexión delgada, polo blanco de algodón sin estampado.',
      voz: {
        idioma: 'Español', varianteRegional: 'Perú - Lima', acento: 'Limeño neutro',
        pronunciacion: 'Clara, seseo', ritmo: 'Conversacional', velocidad: 'Media',
        entonacion: 'Ascendente en preguntas', energia: 'Media-alta', pausas: 'Naturales',
        tono: 'Cálido', timbre: 'Claro', edadVocal: '25 años', estilo: 'Amiga que recomienda',
      },
    })
    expect(ok.success).toBe(true)
  })
})
