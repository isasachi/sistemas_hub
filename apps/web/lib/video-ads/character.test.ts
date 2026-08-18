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

/**
 * ROPA Y ZAPATOS: el producto y el vestuario son EL MISMO OBJETO.
 *
 * El bloque de consistencia describe el vestuario y viaja íntegro a cada lote junto a
 * `productDesc`; sin distinguir el nicho, el prompt afirma "viste camiseta rosa" (la
 * ropa del video original) y "el producto es una blusa crema" en el mismo texto. Y el
 * prompt del avatar pedía explícitamente "sin el producto en el encuadre", que para
 * ropa es justo al revés.
 */
describe('buildIdentityInstruction — producto que se lleva puesto', () => {
  const inputs = {
    productName: 'Camisa Mica', productDescription: 'Camisa de satén con frunces',
    angle: 'Prueba de producto', targetAudience: 'Mujeres de 20 a 35',
    problem: 'No encuentro una camisa que marque la cintura', characterDesc: 'Mujer de 25',
    characterEthnicity: 'Latina peruana', accent: 'Español peruano neutro', voice: '', constraints: '',
  }
  const forensic = {
    duracionTotalSeg: 28, caracteresGuion: 385, guionOriginal: 'x',
    sujeto: 'Mujer joven de cabello oscuro', vestuario: 'Camiseta rosa de manga larga',
    producto: 'Camisa', fondo: 'Pared blanca', elementosGraficos: 'Subtítulos',
    cortes: [{ n: 1, tiempo: '00:00 - 00:01', duracionSeg: 1, accion: 'a', camara: 'Plano medio', dialogo: 'd', textoOverlay: 'No aparece', transicion: 'corte' }],
    tomas: [{ n: 1, encuadre: 'Plano medio', posicion: 'De pie', accionFisica: 'a', objeto: 'camisa', dialogo: 'd', duracionSeg: 1 }],
    edicion: { sincronizacion: 'x', textoOverlay: 'x', escalaZoom: 'x', cortes: 'x', ritmo: 'x', corteFinal: 'x' },
    resumenParaUsuario: 'x',
  }

  it('en suplementos el prompt no cambia', () => {
    const p = buildIdentityInstruction(inputs, forensic, false, 'suplementos')
    expect(p).toContain('sin el producto en el encuadre')
    expect(p).not.toContain('LLEVA PUESTO')
  })

  // Una sesión anterior a la migración no trae nicho: tiene que leerse como antes.
  it('sin nicho se comporta como suplementos', () => {
    expect(buildIdentityInstruction(inputs, forensic, false))
      .toBe(buildIdentityInstruction(inputs, forensic, false, 'suplementos'))
  })

  it('en ropa el avatar aparece VISTIENDO la prenda y el vestuario del original no manda', () => {
    const p = buildIdentityInstruction(inputs, forensic, false, 'ropa')
    expect(p).toContain('EL PRODUCTO ES ROPA Y EL PERSONAJE LO LLEVA PUESTO')
    expect(p).toContain('El producto SÍ va en el encuadre')
    expect(p).not.toContain('sin el producto en el encuadre')
    expect(p).toContain('el vestuario NO se copia')
    // …y el bloque de consistencia tiene que describir la prenda, que es lo único que
    // mantiene la misma ropa entre el lote 1 y el 5.
    expect(p).toContain('El vestuario que describas ES EL PRODUCTO')
  })

  it('en zapatos aplica el mismo eje', () => {
    const p = buildIdentityInstruction(inputs, forensic, false, 'zapatos')
    expect(p).toContain('EL PRODUCTO ES CALZADO Y EL PERSONAJE LO LLEVA PUESTO')
    expect(p).not.toContain('sin el producto en el encuadre')
  })
})

describe('buildCharacterParts — la prenda entra como imagen', () => {
  const img = { data: 'AAA', mimeType: 'image/png' }
  it('sin prenda se comporta como antes', () => {
    expect(buildCharacterParts('instr', img)).toHaveLength(2)
    expect(buildCharacterParts('instr')).toHaveLength(1)
  })
  // Sin verla, el modelo describe un vestuario inventado y el avatar sale con otra ropa.
  it('la prenda va después del personaje y antes del texto', () => {
    const parts = buildCharacterParts('instr', img, { data: 'BBB', mimeType: 'image/jpeg' })
    expect(parts).toHaveLength(3)
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'BBB' } })
    expect(parts[2]).toEqual({ text: 'instr' })
  })
})
