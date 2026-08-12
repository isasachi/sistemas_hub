import { describe, it, expect } from 'vitest'
import { buildTemplateInstruction, ScriptTemplateSchema } from './template'
import type { ForensicReport } from './forensic'

const FORENSIC: ForensicReport = {
  duracionTotalSeg: 12, caracteresGuion: 90,
  guionOriginal: 'Si estás cansado de las marcas, necesitas probar este suero.',
  sujeto: 'Mujer de 25', vestuario: 'Polo azul', producto: 'Frasco rojo',
  fondo: 'Dormitorio', elementosGraficos: 'Subtítulos quemados',
  cortes: [{ n: 1, tiempo: '00:00 - 00:06', duracionSeg: 6, accion: 'Sostiene el frasco', camara: 'Primer plano', dialogo: 'Si estás cansado de las marcas,', textoOverlay: 'Si estás cansado', transicion: 'corte directo' }],
  tomas: [{ n: 1, encuadre: 'Primer plano', posicion: 'Frente a cámara', accionFisica: 'Levanta el frasco', objeto: 'Frasco', dialogo: 'Si estás cansado de las marcas,', duracionSeg: 6 }],
  edicion: { sincronizacion: 'Voz y acción', textoOverlay: 'Subtítulos', escalaZoom: 'Sin zoom', cortes: 'Jump cut', ritmo: 'Rápido', corteFinal: 'Placa de TikTok' },
  resumenParaUsuario: 'Testimonio directo.',
}

describe('buildTemplateInstruction', () => {
  const p = buildTemplateInstruction(FORENSIC)

  it('prohíbe escribir un guión nuevo', () => {
    expect(p).toMatch(/no.*cre(es|ar) un gui[oó]n nuevo/i)
    expect(p).toMatch(/pr[aá]cticamente igual/i)
  })

  it('incluye el guión original literal', () => {
    expect(p).toContain(FORENSIC.guionOriginal)
  })

  it('exige NO GENERAR subtítulos ni overlays', () => {
    expect(p).toContain('NO GENERAR')
  })

  it('conserva la duración de cada toma', () => {
    expect(p).toMatch(/duraci[oó]n.*original/i)
  })
})

describe('ScriptTemplateSchema', () => {
  it('acepta un template completo', () => {
    const ok = ScriptTemplateSchema.safeParse({
      guionFillInBlank: 'Si estás cansado de [problema], necesitas probar [producto].',
      escenario: {
        publicoObjetivo: '[Público objetivo]', problemaDeseo: '[Problema]',
        personaje: '[Personaje]', vestuario: '[Vestuario equivalente]',
        producto: '[Producto]', caracteristicasProducto: '[Descripción visual]',
        fondo: '[Fondo]', objetosSecundarios: '[Props]',
      },
      tomas: [{ n: 1, accionVisual: 'Sostiene [producto]', locucion: 'Si estás cansado de [problema],', duracionSeg: 6 }],
      edicion: {
        cortesPorSalto: 'Sí, jump cut entre frases', ceroSilencios: 'Sí',
        zoom: 'Sin zoom', ritmo: 'Rápido', loopInfinito: 'No',
      },
      resumenParaUsuario: 'Plantilla de testimonio directo.',
    })
    expect(ok.success).toBe(true)
  })

  it('rechaza un template sin tomas', () => {
    expect(ScriptTemplateSchema.safeParse({ guionFillInBlank: 'x', tomas: [] }).success).toBe(false)
  })
})
