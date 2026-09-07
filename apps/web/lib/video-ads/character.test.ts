import { describe, it, expect } from 'vitest'
import {
  buildIdentityInstruction, buildCharacterParts, CharacterIdentitySchema,
  VOZ_ESTANDAR, vozDe, PERFILES_VOCALES, promptDeAvatar, REALISMO_AVATAR,
} from './character'
import type { UserInputs } from './types'
import type { ForensicReport } from './forensic'

const INPUTS: UserInputs = {
  productName: 'Serum Eunoia', productDescription: 'Suero', angle: 'Testimonio',
  targetAudience: 'Mujeres 20-35', problem: 'Marcas de acné',
  characterDesc: '', characterEthnicity: '', accent: '', voice: '', constraints: '',
}
const FORENSIC = { sujeto: 'Mujer joven de cabello oscuro', vestuario: 'Polo azul', fondo: 'Dormitorio' } as ForensicReport

describe('buildIdentityInstruction', () => {
  it('prohíbe los tres atajos de identidad que el spec lista', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC)
    expect(p).toMatch(/el mismo personaje/i)
    expect(p).toMatch(/igual al anterior/i)
    expect(p).toMatch(/idéntica persona/i)
  })

  // El requisito legal: la foto es de una persona real que no dio permiso. Si esta
  // aserción cae, el avatar pasa a ser el retrato de alguien.
  it('LA CARA ES NUEVA: pide el tipo físico y prohíbe reproducir la de la foto', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC)
    expect(p).toMatch(/la cara es nueva/i)
    expect(p).toMatch(/tipo físico/i)
    expect(p).toMatch(/distinta nariz/i)
  })

  it('la foto es la única fuente de la apariencia, no el video ni una descripción', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC)
    expect(p).toMatch(/la foto adjunta es el personaje/i)
    expect(p).toMatch(/nunca de una\s+descripción escrita/i)
  })

  it('el acento y el perfil vocal se infieren del personaje, no se piden', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC)
    expect(p).toMatch(/`perfilVocal`/)
    expect(p).toMatch(/`acento`.*inferido de/is)
    for (const perfil of PERFILES_VOCALES) expect(p).toContain(perfil)
  })

  // "Equivalente" era la latitud por la que el avatar salió en una cocina blanca con
  // camisa blanca sobre un original de suéter rosa y pared crema — y como es Image1 en
  // todos los lotes, el ambiente del original no llegaba al clip por ninguna vía.
  it('el vestuario y el escenario se COPIAN, con el encuadre de apertura del original', () => {
    const f = { ...FORENSIC, cortes: [{ camara: 'Primer plano, cámara fija' }] } as ForensicReport
    const p = buildIdentityInstruction(INPUTS, f)
    expect(p).toMatch(/se COPIAN, no se reinterpretan/)
    expect(p).not.toMatch(/equivalente/i)
    expect(p).toContain('Primer plano, cámara fija')
    expect(p).toMatch(/NO abras el plano/)
    // sin cortes cae al valor de siempre
    expect(buildIdentityInstruction(INPUTS, FORENSIC)).toContain('plano medio, ángulo levemente bajo')
  })

  it('prohíbe overlays en la imagen del personaje', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC)
    expect(p).toMatch(/sin texto|no text/i)
  })

  // El avatar es el ancla visual del clip, así que su encuadre es el del anuncio.
  it('pide 9:16, no el 2:3 de la época en que el personaje nunca iba solo', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC)
    expect(p).toMatch(/9:16/)
    expect(p).not.toMatch(/2:3/)
  })
})

// Lo ÚNICO que llega al generador de imagen es `promptCreacion`, que lo redacta un LLM.
// Con la regla del acabado viviendo solo en la instrucción, el avatar salía acartonado
// cada vez que el modelo no la copiaba — y su vocabulario por defecto, describiendo a
// alguien para un anuncio, es el de la publicidad de belleza.
describe('promptDeAvatar', () => {
  it('pega el acabado aunque el LLM no lo haya escrito, y va al final', () => {
    const p = promptDeAvatar('Mujer de 30 años, cabello oscuro, suéter rosa.')
    expect(p).toContain('Mujer de 30 años')
    expect(p.endsWith(REALISMO_AVATAR)).toBe(true)
    expect(p).toMatch(/poros/i)
    expect(p).toMatch(/NO ES SIMÉTRICA/)
    expect(p).toMatch(/imagen de IA/i)
  })

  it('prohíbe el acabado de plástico y acota las imperfecciones a las de una cara real', () => {
    for (const veto of [/piel alisada/i, /filtro de belleza/i, /render 3D/i, /simetría facial exacta/i])
      expect(REALISMO_AVATAR).toMatch(veto)
    // un avatar con lesiones contradice lo que el anuncio promete
    expect(REALISMO_AVATAR).toMatch(/nada de heridas/i)
  })

  it('la instrucción no le pide el acabado al LLM y le prohíbe el vocabulario que lo rompe', () => {
    const p = buildIdentityInstruction(INPUTS, FORENSIC)
    expect(p).toMatch(/NO describas el acabado/)
    expect(p).toMatch(/radiante/)
    expect(p).toMatch(/sin poros/)
  })
})

describe('buildCharacterParts', () => {
  it('el part de imagen va ANTES del de texto', () => {
    const parts = buildCharacterParts('instrucción', { data: 'YQ==', mimeType: 'image/png' })
    expect(parts).toEqual([
      { inlineData: { mimeType: 'image/png', data: 'YQ==' } },
      { text: 'instrucción' },
    ])
  })
})

describe('perfiles de voz', () => {
  it('los cuatro existen y solo se diferencian en lo que depende del cuerpo', () => {
    const perfiles = Object.values(VOZ_ESTANDAR)
    expect(perfiles).toHaveLength(4)
    expect(new Set(perfiles.map((v) => v.ritmo)).size).toBe(1)
    expect(new Set(perfiles.map((v) => `${v.tono}|${v.timbre}|${v.edadVocal}`)).size).toBe(4)
  })

  it('vozDe pega el acento inferido dentro del perfil fijo', () => {
    const voz = vozDe({
      promptCreacion: 'x', bloqueConsistencia: 'y',
      perfilVocal: 'mujer-joven', acento: 'Español peruano de Lima',
    })
    expect(voz.acento).toBe('Español peruano de Lima')
    expect(voz.edadVocal).toBe(VOZ_ESTANDAR['mujer-joven'].edadVocal)
  })

  it('sin acento cae a neutro en vez de dejar el campo vacío en el prompt', () => {
    expect(vozDe({ promptCreacion: 'x', bloqueConsistencia: 'y', perfilVocal: 'varon-mayor', acento: '  ' }).acento)
      .toBe('Español latino neutro')
  })
})

describe('CharacterIdentitySchema', () => {
  it('acepta una identidad completa', () => {
    expect(CharacterIdentitySchema.safeParse({
      promptCreacion: 'Retrato vertical 9:16 de mujer de 25 años...',
      bloqueConsistencia: 'Mujer de 25 años, cabello negro liso recogido, piel clara...',
      perfilVocal: 'mujer-joven',
      acento: 'Español peruano de Lima',
    }).success).toBe(true)
  })

  it('rechaza un perfil vocal fuera de los cuatro', () => {
    expect(CharacterIdentitySchema.safeParse({
      promptCreacion: 'x', bloqueConsistencia: 'y', perfilVocal: 'robot', acento: 'z',
    }).success).toBe(false)
  })
})
