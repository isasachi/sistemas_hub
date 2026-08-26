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

  // El prompt cambió de trabajo: ya no escribe la plantilla entera ni decide las tomas
  // —eso son los cortes del forense— sino que marca huecos en el diálogo de cada corte.
  // Pedirle las tomas produjo frases partidas y oraciones enteras dentro de un corchete.
  it('deja claro que su único trabajo es marcar huecos, no escribir ni particionar', () => {
    expect(p).toMatch(/TU ÚNICO TRABAJO/i)
    expect(p).toMatch(/no decidas\s+cuántas tomas hay/i)
    expect(p).toMatch(/Las tomas ya existen/i)
  })

  it('le pasa el diálogo de cada corte, con su n', () => {
    expect(p).toContain('n=1')
    expect(p).toContain(FORENSIC.cortes[0].dialogo)
    expect(p).toMatch(/sin comillas/i)
  })

  it('exige copia literal fuera de los corchetes', () => {
    expect(p).toMatch(/idéntico carácter por carácter/i)
    expect(p).toMatch(/ni una\s+palabra añadida, quitada ni reordenada/i)
  })





  it('exige NO GENERAR subtítulos ni overlays', () => {
    expect(p).toContain('NO GENERAR')
  })

  // La plantilla que escribió el dueño del repo para el video de prueba tiene 23 huecos
  // sobre ~45 s, y marca cosas que la versión anterior de este prompt declaraba
  // "universales": la edad del avatar, la zona de aplicación, la frecuencia de uso.
  // Dejarlas fijas no es conservador, es peligroso — un champú no se aplica en cara y
  // cuello, y el anuncio del usuario lo afirmaría igual.
  it('manda marcar edad, zona de aplicación, frecuencia y público', () => {
    expect(p).toMatch(/edad o el hito vital/i)
    expect(p).toContain('en cara y en cuello')
    expect(p).toContain('de día y de noche')
    expect(p).toContain('todo tipo de piel')
    expect(p).toMatch(/afirmando algo que su\s+producto no hace/i)
  })

  it('pide nombres descriptivos en vez de una lista cerrada', () => {
    expect(p).toMatch(/No hay lista cerrada/i)
    expect(p).toContain('[situación personal / edad / hito]')
    expect(p).toContain('[frecuencia / momento del día]')
  })

  // Tres blancos numerados, no uno fusionado: son datos distintos y numerarlos es lo que
  // impide que la FASE 3 les ponga el mismo valor a todos. Pero el producto nombrado tres
  // veces SÍ es el mismo dato y no se numera — si no, saldrían tres productos distintos.
  it('manda numerar datos distintos del mismo tipo, y NO el mismo dato repetido', () => {
    expect(p).toMatch(/NUMERA cuando son DATOS DISTINTOS/)
    expect(p).toContain('[ingrediente 1]')
    expect(p).toMatch(/NO numeres cuando es LITERALMENTE EL MISMO dato/)
  })

  // El corchete se pasaba de ancho por el otro lado: se tragaba "de la marca", el
  // posesivo "tu"/"mi", o marcaba "y de verdad", que es andamiaje puro.
  it('marca los bordes que el modelo se traga: fórmulas fijas y posesivos', () => {
    expect(p).toMatch(/TAMPOCO se traga el andamiaje/)
    expect(p).toContain('de la marca [nombre de la marca]')
    expect(p).toContain('a tu [rutina]')
    expect(p).toContain('que vean mi [evidencia visible]')
  })

  // Antes decía "el corchete cubre el MÍNIMO", y por eso marcaba "hidratar" donde el
  // dato real era "hidratar las capas más profundas de la piel".
  it('exige que el corchete cubra el dato completo, no su primera palabra', () => {
    expect(p).toMatch(/DATO COMPLETO/)
    expect(p).toContain('hidratar las capas más profundas de la piel')
  })

  // El ejemplo es una tabla de alineación, no una plantilla ejecutable, y avisa de que
  // viene de otro video: un ejemplo con forma de output ya se copió literal una vez.
  it('presenta la referencia como alineación y avisa que es de otro video', () => {
    expect(p).toMatch(/ALINEACIÓN DE REFERENCIA/)
    expect(p).toMatch(/de OTRO video/)
    expect(p).toMatch(/NO copies estas palabras/)
  })

  it('avisa de que marcar de menos es el fallo habitual', () => {
    expect(p).toMatch(/VEINTITR[EÉ]S huecos/i)
    expect(p).toMatch(/Marcar de\s+menos es el fallo habitual/i)
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
