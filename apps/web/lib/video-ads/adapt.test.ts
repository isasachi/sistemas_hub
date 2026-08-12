import { describe, it, expect } from 'vitest'
import { buildAdaptInstruction, AdaptedScriptSchema } from './adapt'
import type { ScriptTemplate } from './template'
import type { ForensicReport } from './forensic'
import type { UserInputs } from './types'

const TEMPLATE: ScriptTemplate = {
  guionFillInBlank: 'Si estás cansado de [Problema], necesitas probar [Producto].',
  escenario: {
    publicoObjetivo: '[Público objetivo]', problemaDeseo: '[Problema]',
    personaje: '[Personaje]', vestuario: '[Vestuario]', producto: '[Producto]',
    caracteristicasProducto: '[Descripción visual]', fondo: '[Fondo]', objetosSecundarios: '[Props]',
  },
  tomas: [{ n: 1, accionVisual: 'Sostiene [Producto]', locucion: 'Si estás cansado de [Problema],', duracionSeg: 6 }],
  edicion: { cortesPorSalto: 'Sí', ceroSilencios: 'Sí', zoom: 'Sin zoom', ritmo: 'Rápido', loopInfinito: 'No' },
  resumenParaUsuario: 'Testimonio.',
}

const FORENSIC = {
  caracteresGuion: 58,
  guionOriginal: 'Si estás cansado de las marcas, necesitas probar este suero.',
  cortes: [{ n: 1, tiempo: '00:00 - 00:06', duracionSeg: 6, accion: '', camara: '', dialogo: '', textoOverlay: '', transicion: '' }],
} as ForensicReport

const INPUTS: UserInputs = {
  productName: 'Serum Eunoia', productDescription: 'Suero de niacinamida',
  angle: 'Testimonio de 4 semanas', targetAudience: 'Mujeres 20-35',
  problem: 'Marcas de acné', characterDesc: 'Mujer de 25',
  characterEthnicity: 'Latina peruana', accent: 'Español peruano de Lima',
  voice: '', constraints: '',
}

describe('buildAdaptInstruction', () => {
  const p = buildAdaptInstruction(TEMPLATE, FORENSIC, INPUTS, null)

  it('prohíbe mejorar el guión', () => {
    expect(p).toMatch(/no mejores el gui[oó]n/i)
    expect(p).toMatch(/no introduzcas frameworks/i)
  })

  it('muestra ejemplo concreto de adaptación literal, no plantilla', () => {
    expect(p).toContain('Si estás cansado de las marcas de acné, necesitas probar Serum Eunoia.')
    expect(p).toContain('PROHIBIDO:  "¿Sabías que miles de personas')
  })

  it('exige [VARIABLE PENDIENTE] en vez de inventar', () => {
    expect(p).toContain('[VARIABLE PENDIENTE]')
    expect(p).toMatch(/no inventes/i)
    expect(p).toContain('Este es el ÚNICO')
    expect(p).toContain('corchete permitido')
  })

  it('fija TEXTO EN PANTALLA: NINGUNO', () => {
    expect(p).toMatch(/NINGUNO/)
  })

  it('pide mantener la longitud del original', () => {
    expect(p).toContain('58')
  })

  it('incluye los INPUTS del usuario en la jerarquía del spec', () => {
    expect(p).toContain('Serum Eunoia')
    expect(p).toContain('Marcas de acné')
    expect(p).toContain('Testimonio de 4 semanas')
  })

  it('incluye las marcas de tiempo de la referencia', () => {
    expect(p).toContain('MARCAS DE TIEMPO DE LA REFERENCIA')
    expect(p).toContain('00:00 - 00:06')
  })

  it('incluye el acento regional en los INPUTS', () => {
    expect(p).toContain('ACENTO REGIONAL: Español peruano de Lima')
    expect(p).toContain('VARIANTE REGIONAL')
    expect(p).toMatch(/variante regional del español/i)
  })

  it('instruye a copiar tiempoOriginal de las marcas, no inventarlo', () => {
    expect(p).toContain('tiempoOriginal` se copia del bloque "MARCAS DE TIEMPO DE LA REFERENCIA"')
    expect(p).toMatch(/NO inventes marcas de tiempo/i)
  })
})

describe('AdaptedScriptSchema', () => {
  it('acepta un guión adaptado completo', () => {
    const ok = AdaptedScriptSchema.safeParse({
      guionFinal: 'Si estás cansado de las marcas de acné, necesitas probar Serum Eunoia.',
      caracteresAdaptado: 68, diferenciaCaracteres: 10,
      tomas: [{
        n: 1, tiempoOriginal: '00:00 - 00:06', duracionSeg: 6,
        accionVisual: 'Sostiene el frasco de Serum Eunoia frente a la cámara',
        personaje: 'Mujer de 25, cabello negro recogido',
        producto: 'Frasco celeste con gotero blanco',
        locucion: 'Si estás cansado de las marcas de acné,',
      }],
      variablesPendientes: [],
    })
    expect(ok.success).toBe(true)
  })

  it('rechaza un guión sin tomas', () => {
    expect(AdaptedScriptSchema.safeParse({ guionFinal: 'x', tomas: [] }).success).toBe(false)
  })
})
