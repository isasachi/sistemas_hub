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

  // El hueco tiene DOS bordes y los dos fallan distinto. Corto de más deja el dato del
  // anuncio original colgando fuera ("[Beneficio] las capas más profundas de la piel" le
  // publica al usuario un claim de La Roche-Posay); largo de más se traga el andamiaje
  // que hace que la plantilla espeje al original.
  it('exige que el corchete cubra el DATO COMPLETO sin tragarse el andamiaje', () => {
    expect(p).toContain('EL CORCHETE CUBRE EL DATO COMPLETO')
    expect(p).toMatch(/NO SE TRAGA EL ANDAMIAJE/i)
    expect(p).toMatch(/una\s+oración entera nunca va dentro/i)
    expect(p).toContain('[Este es el Producto]')
    // La regla vieja decía lo contrario y producía justo el hueco de una palabra.
    expect(p).not.toMatch(/cubre el M[IÍ]NIMO/i)
  })

  // "No marques de menos" es una prohibición y no se puede ejecutar. La prueba sí:
  // poné el valor de OTRO producto y mirá si lo que queda sigue siendo cierto.
  it('da la prueba de sustitución y la asimetría de los dos errores', () => {
    expect(p).toMatch(/un valor de OTRO producto/i)
    expect(p).toMatch(/afirma algo falso sobre ese otro producto/i)
    expect(p).toMatch(/creciste de m[aá]s/i)
    expect(p).toMatch(/ANTE LA DUDA, MARCAR/i)
    expect(p).toMatch(/encajar? gramaticalmente|ENCAJAR GRAMATICALMENTE/i)
  })

  // El spec da una lista CERRADA de 12 variables y dice "no reemplaces palabras
  // universales innecesariamente". Autorizar nombres inventados produjo [frecuencia]
  // para una edad y 14 huecos en un guion de un minuto: ilegible y engorroso de llenar.
  it('impone la lista cerrada del spec y prohíbe inventar nombres', () => {
    expect(p).toMatch(/Esa lista es CERRADA/i)
    expect(p).toMatch(/No inventes nombres nuevos/i)
    expect(p).toContain('[Situación frustrante]')
    expect(p).not.toMatch(/inv[eé]ntalo/i)
  })

  it('repite la regla del spec sobre palabras universales', () => {
    expect(p).toMatch(/NO REEMPLACES PALABRAS UNIVERSALES/i)
    expect(p).toMatch(/PR[AÁ]CTICAMENTE IGUAL al guion original/i)
  })

  // "cara" y "los 30" las diría igual un anuncio de cualquier producto; "menstruación"
  // no. Ese es el criterio, y sin él el modelo marca todo o nada.
  // El techo de "entre cinco y ocho" era invención de este repo: la plantilla de
  // referencia del dueño para este mismo video tiene 23 huecos, y el techo empujaba a
  // marcar de menos justo donde marcar de menos publica el claim de otra marca.
  it('da el criterio y NO impone un techo de volumen', () => {
    expect(p).toMatch(/un anuncio de otro producto NO la\s+podría decir igual/i)
    expect(p).not.toMatch(/entre cinco y\s+ocho huecos/i)
    expect(p).not.toMatch(/te pasas de diez/i)
  })

  it('exige NO GENERAR subtítulos ni overlays', () => {
    expect(p).toContain('NO GENERAR')
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
  // Lo pidió el dueño del repo junto al resto de la lista de fidelidad: si el original
  // se corta a mitad de idea o repite, la plantilla tiene que hacerlo igual.
  it('exige conservar los cambios de idea y las repeticiones del original', () => {
    const p = buildTemplateInstruction(FORENSIC)
    expect(p).toMatch(/cambios de idea/i)
    expect(p).toMatch(/repite una palabra o se[\s\S]{0,20}corta a mitad de idea/i)
  })
})
