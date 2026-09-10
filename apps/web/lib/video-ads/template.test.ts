import { describe, it, expect } from 'vitest'
import { buildTemplateInstruction, ScriptTemplateSchema } from './template'
import type { ForensicReport } from './forensic'

const FORENSIC: ForensicReport = {
  duracionTotalSeg: 12, caracteresGuion: 90,
  guionOriginal: 'Si estás cansado de las marcas, necesitas probar este suero.',
  manoQueGraba: '',
  sujeto: 'Mujer de 25', vestuario: 'Polo azul', producto: 'Frasco rojo',
  fondo: 'Dormitorio', elementosGraficos: 'Subtítulos quemados',
  cortes: [{ n: 1, tiempo: '00:00 - 00:06', duracionSeg: 6, accion: 'Sostiene el frasco', hechos: [], camara: 'Primer plano', dialogo: 'Si estás cansado de las marcas,', textoOverlay: 'Si estás cansado', transicion: 'corte directo' }],
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
    expect(p).toMatch(/el valor de un producto\s+de otro rubro/i)
    expect(p).toMatch(/afirma algo que ese otro producto no hace/i)
    expect(p).toMatch(/creciste de m[aá]s/i)
    // Medido 3/3: mostrarle el hueco MAL cortado de una frase del propio guion se lo
    // hace copiar tal cual. La prueba se explica; la frase rota no se escribe.
    expect(p).not.toMatch(/\[Beneficio\] las capas/i)
    expect(p).toMatch(/ANTE LA DUDA, MARCAR/i)
    expect(p).toMatch(/encajar? gramaticalmente|ENCAJAR GRAMATICALMENTE/i)
  })

  // La lista cerrada de 14 nombres forzaba ~23 roles distintos dentro de 14 etiquetas:
  // [Beneficio] caía sobre una ranura de mecanismo y [Resultado] sobre una de beneficio.
  // El nombre correcto es el del ROL que el dato cumple en SU frase.
  it('no impone lista de nombres: el nombre describe el rol del dato', () => {
    expect(p).toMatch(/NO HAY LISTA DE NOMBRES/i)
    expect(p).toMatch(/ROL QUE ESE DATO\s+CUMPLE EN SU PROPIA FRASE/i)
    expect(p).toMatch(/NO es una lista cerrada/i)
    expect(p).not.toMatch(/Esa lista es CERRADA/i)
    expect(p).not.toMatch(/No inventes nombres nuevos/i)
  })

  // Sin barras, un dato ambiguo recibe una etiqueta que miente; sin número, tres
  // ingredientes distintos reciben el mismo valor y la frase lo enumera tres veces.
  it('pide barras para el dato ambiguo y número para el repetido distinto', () => {
    expect(p).toMatch(/BARRAS cuando el dato admite/i)
    expect(p).toMatch(/N[UÚ]MERO cuando el MISMO tipo de dato/i)
    expect(p).toMatch(/MISMO dato repetido[\s\S]{0,80}NO lleva n[uú]mero/i)
  })

  // El criterio viejo ("¿otro anuncio podría decir esta palabra igual?") declaraba
  // universales justo los datos que la plantilla de referencia del dueño SÍ marca —la
  // frecuencia, la zona de aplicación y la edad—, o sea contradecía a la regla de "ante
  // la duda, marcar" que vive unas líneas más abajo en el MISMO prompt. Y el techo de
  // "entre cinco y ocho" era invención de este repo: esa plantilla tiene 23 huecos.
  it('decide por la consecuencia de no marcar, no por si la palabra suena corriente', () => {
    expect(p).toMatch(/qué pasa si NO la\s+marcas/i)
    expect(p).toMatch(/de día y de noche/i)
    expect(p).toMatch(/en cara y en cuello/i)
    expect(p).not.toMatch(/son palabras corrientes: van tal cual/i)
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
    expect(p).toMatch(/cambios de\s+idea/i)
    expect(p).toMatch(/repite una palabra o se[\s\S]{0,20}corta a mitad\s+de idea/i)
  })
})
