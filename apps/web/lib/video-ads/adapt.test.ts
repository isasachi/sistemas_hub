import { describe, it, expect } from 'vitest'
import { buildAdaptInstruction, AdaptedScriptSchema, applyScriptEdits, resyncTomaDurations, type AdaptedScript } from './adapt'
import { extractSlots } from './fill'
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
  const p = buildAdaptInstruction(TEMPLATE, FORENSIC, INPUTS, null, extractSlots(TEMPLATE), 'Español peruano de Lima')



  // La política es rellenar, pero no a costa de firmar cosas en nombre del usuario:
  // una marca que no escribió o un ingrediente que no está en la etiqueta son una
  // declaración falsa de composición dentro de un anuncio que se publica.
  it('acota lo que NUNCA se inventa: marcas, ingredientes y cifras', () => {
    expect(p).toMatch(/LO QUE NO SE INVENTA NUNCA/)
    expect(p).toMatch(/una MARCA que\s+el usuario no escribió/)
    expect(p).toMatch(/el hueco va vacío/)
  })

  // El ejemplo del "incidente PHE-resorcinol" que este prompt citaba era doblemente
  // malo: el incidente nunca ocurrió (la etiqueta de esa sesión SÍ decía
  // PHE-RESORCINOL) y, sobre todo, era un anti-ejemplo con forma de valor — o sea una
  // plantilla que rellenar. Que no vuelva.
  it('no trae anti-ejemplos con forma de valor', () => {
    expect(p).not.toContain('PHE-resorcinol')
    expect(p).not.toContain('La Roche-Posay')
  })






  // La coreografía observada tiene que llegar a accionVisual, no reescribirse.
  it('manda copiar la acción observada del corte, con el gotero y el giro', () => {
    expect(p).toContain('CORTES REALES DE LA REFERENCIA')
    expect(p).toMatch(/no\s+se\s+inventa\s+ni\s+se\s+resume/i)
    expect(p).toMatch(/qué\s+mano,\s+cómo\s+agarra/i)
  })

  // La orden de rellenar tiene que ir arriba: medido, entre los bullets el modelo se
  // queda con el tono conservador del encabezado y devuelve el doble de pendientes.
  it('la orden de RELLENAR va en la cabecera, no entre los bullets', () => {
    const cabecera = p.slice(0, p.indexOf('── HUECOS ──'))
    expect(cabecera).toMatch(/RELLENA TODOS LOS HUECOS/)
    expect(cabecera).toMatch(/lo m[áa]s veros[íi]mil/i)
  })

  it('el andamiaje es la única regla inviolable, con la excepción gramatical', () => {
    expect(p).toMatch(/ÚNICA REGLA INVIOLABLE ES EL ANDAMIAJE/)
    expect(p).toMatch(/copia palabra por palabra/)
    expect(p).toMatch(/concordancia gramatical/)
    expect(p).toMatch(/Dentro de los corchetes tienes libertad; fuera, ninguna/)
  })

  it('lista los huecos con su id y su contexto', () => {
    expect(p).toContain('Producto#1')
    expect(p).toContain('⟦Producto⟧')
  })

  // "mi ⟦parte del cuerpo⟧" → el valor es "cara", no "mi cara": el posesivo ya está.
  it('avisa que el valor no repite las palabras vecinas', () => {
    expect(p).toMatch(/el posesivo ya está puesto/i)
    expect(p).toMatch(/nunca devuelvas la frase entera ya armada/i)
  })

  // El ejemplo anterior de este bloque citaba una frase de plantilla ya rellenada
  // ("Este es el suero de la marca … y se llama …") como muestra de lo que sale MAL, y
  // el modelo la copió literal como valor de hueco. Un anti-ejemplo con forma de valor
  // es una plantilla que rellenar. Ahora los tres roles se nombran sin dar la frase.
  it('distingue categoría, marca y nombre comercial sin darle una frase que copiar', () => {
    expect(p).toMatch(/la CATEGORÍA/)
    expect(p).toMatch(/la MARCA/)
    expect(p).toMatch(/el NOMBRE COMERCIAL/)
    expect(p).not.toContain('y se llama ⟦Producto⟧')
  })

  it('prohíbe usar el nombre del hueco como valor', () => {
    expect(p).toMatch(/etiqueta del/i)
    expect(p).toContain('tipo de producto')
  })

  // Se invierte a propósito la política anterior ("un hueco vacío es un resultado
  // correcto"): el guion es un borrador que el usuario corrige línea por línea, y uno
  // completo se corrige mientras que uno con agujeros hay que rellenarlo a mano. Lo
  // único que sigue quedando vacío es lo que el usuario tendría que salir a demostrar.
  it('solo deja vacío lo que compromete al usuario', () => {
    expect(p).toMatch(/Un hueco se deja VACÍO solo si/)
    expect(p).toMatch(/aval médico|estudio clínico|certificación/)
    expect(p).toMatch(/En todo lo demás, rellena/)
    expect(p).not.toMatch(/hueco\s+vac[ií]o\s+es\s+un\s+resultado\s+correcto/i)
  })

  it('fija TEXTO EN PANTALLA: NINGUNO', () => {
    expect(p).toMatch(/NINGUNO/)
  })



  it('incluye los INPUTS del usuario en la jerarquía del spec', () => {
    expect(p).toContain('Serum Eunoia')
    expect(p).toContain('Marcas de acné')
    expect(p).toContain('Testimonio de 4 semanas')
  })


  // El acento ya no es un input del usuario: lo infiere la FASE 4 del personaje y
  // llega por parámetro desde el perfil de voz.
  it('incluye el acento inferido del personaje', () => {
    expect(p).toContain('ACENTO DEL PERSONAJE: Español peruano de Lima')
    expect(p).toMatch(/variante\s+regional\s+del\s+español/i)
    expect(p).toMatch(/"tú"\s*\/\s*"vos"/)
  })

})

// El spec manda dejar los huecos que no se pueden completar como marcadores y NO
// preguntar; corregirlos es entonces edición de texto del usuario. Antes había un
// formulario por variable, que preguntaba lo prohibido y además no dejaba tocar la
// frase alrededor cuando el modelo elegía un valor que no concordaba.
describe('applyScriptEdits', () => {
  const base: AdaptedScript = {
    guionFinal: 'Este suero me cambió. Da un efecto [PENDIENTE: Resultado].',
    caracteresAdaptado: 58,
    // 58 - 8 = 50 caracteres tenía el original.
    diferenciaCaracteres: 8,
    tomas: [
      { n: 1, tiempoOriginal: '00:00 - 00:03', duracionSeg: 3, accionVisual: 'a', personaje: 'p', producto: 'x', locucion: 'Este suero me cambió.' },
      { n: 2, tiempoOriginal: '00:03 - 00:07', duracionSeg: 4, accionVisual: 'b', personaje: 'p', producto: 'x', locucion: 'Da un efecto [PENDIENTE: Resultado].' },
    ],
    variablesPendientes: ['[PENDIENTE: Resultado]'],
  }

  // Se indexa por posición y no por `toma.n`: el `n` lo hereda el forense y nada
  // garantiza que sea único. Acá las dos tomas comparten `n: 7` a propósito — con
  // indexado por `n`, una sola edición pisaría las dos locuciones.
  it('edita por posición, no por `n`, aunque dos tomas compartan el número', () => {
    const chocan: AdaptedScript = { ...base, tomas: base.tomas.map((t) => ({ ...t, n: 7 })) }
    const r = applyScriptEdits(chocan, { 1: 'Solo la segunda.' }, 50)
    expect(r.tomas[0].locucion).toBe('Este suero me cambió.')
    expect(r.tomas[1].locucion).toBe('Solo la segunda.')
  })

  it('reescribe solo la toma editada y deja el resto intacto', () => {
    const r = applyScriptEdits(base, { 1: 'Da un efecto iluminador.' }, 50)
    expect(r.tomas[0].locucion).toBe('Este suero me cambió.')
    expect(r.tomas[1].locucion).toBe('Da un efecto iluminador.')
    expect(r.guionFinal).toBe('Este suero me cambió. Da un efecto iluminador.')
  })

  it('conserva la duración y el tiempo original de cada toma', () => {
    const r = applyScriptEdits(base, { 1: 'otra cosa' }, 50)
    expect(r.tomas.map((t) => t.duracionSeg)).toEqual([3, 4])
    expect(r.tomas[1].tiempoOriginal).toBe('00:03 - 00:07')
  })

  // La métrica del spec ("Diferencia frente al original") se recalcula siempre contra
  // el original del forense, así que encadenar ediciones no la hace derivar.
  it('recalcula caracteres y diferencia contra el original, no contra la versión previa', () => {
    const r = applyScriptEdits(base, { 0: 'Hola.', 1: 'Chau.' }, 50)
    expect(r.guionFinal).toBe('Hola. Chau.')
    expect(r.caracteresAdaptado).toBe(11)
    expect(r.diferenciaCaracteres).toBe(-39)
  })

  // Lo que bloquea el render: sale del TEXTO, nunca de una lista que mande el cliente.
  it('vacía los pendientes cuando el usuario escribe el hueco', () => {
    expect(applyScriptEdits(base, { 1: 'Da un efecto iluminador.' }, 50).variablesPendientes).toEqual([])
  })

  it('detecta un marcador nuevo si el usuario lo deja al editar', () => {
    expect(applyScriptEdits(base, { 0: 'Este [PENDIENTE: Producto] me cambió.' }, 50).variablesPendientes)
      .toEqual(['[PENDIENTE: Producto]', '[PENDIENTE: Resultado]'])
  })

  it('sin ediciones devuelve el mismo guión', () => {
    const r = applyScriptEdits(base, {}, 50)
    expect(r.guionFinal).toBe(base.guionFinal)
    expect(r.caracteresAdaptado).toBe(base.guionFinal.length)
  })

  // Una posición que no existe no puede crear una toma fantasma: `groupIntoLotes` la
  // renderizaría como un lote pagado con texto que nadie escribió en su lugar.
  it('ignora una edición para una posición que no existe', () => {
    const r = applyScriptEdits(base, { 99: 'fantasma' }, 50)
    expect(r.tomas).toHaveLength(2)
    expect(r.guionFinal).not.toContain('fantasma')
  })
})

// Reparar el cronometraje del forense no sirve de nada si la sesión ya tiene guión
// adaptado: `generate-lotes` agrupa sobre `adapted.tomas`, no sobre el forense.
describe('resyncTomaDurations', () => {
  const base: AdaptedScript = {
    guionFinal: 'Uno. Dos.',
    caracteresAdaptado: 9, diferenciaCaracteres: 0,
    tomas: [
      { n: 1, tiempoOriginal: '00:00 - 00:02', duracionSeg: 2, accionVisual: 'a', personaje: 'p', producto: 'x', locucion: 'Uno.' },
      { n: 2, tiempoOriginal: '00:02 - 00:12', duracionSeg: 10, accionVisual: 'b', personaje: 'p', producto: 'x', locucion: 'Dos.' },
    ],
    variablesPendientes: [],
  }

  it('baja las duraciones nuevas sin tocar el texto', () => {
    const r = resyncTomaDurations(base, [{ duracionSeg: 3 }, { duracionSeg: 9 }])!
    expect(r.tomas.map((t) => t.duracionSeg)).toEqual([3, 9])
    expect(r.tomas.map((t) => t.locucion)).toEqual(['Uno.', 'Dos.'])
    expect(r.guionFinal).toBe(base.guionFinal)
  })

  // Devolver null = "no hay nada que escribir", para no tocar la fila por gusto.
  it('devuelve null si las duraciones ya coinciden', () => {
    expect(resyncTomaDurations(base, [{ duracionSeg: 2 }, { duracionSeg: 10 }])).toBeNull()
  })

  // Si los largos no cuadran, el guión no corresponde a estos cortes: emparejar por
  // índice le pondría a cada toma la duración de otra.
  it('no toca nada si el guión no tiene una toma por corte', () => {
    expect(resyncTomaDurations(base, [{ duracionSeg: 3 }])).toBeNull()
  })

  it('conserva tiempoOriginal, que apunta al video fuente y no se recalcula', () => {
    const r = resyncTomaDurations(base, [{ duracionSeg: 3 }, { duracionSeg: 9 }])!
    expect(r.tomas.map((t) => t.tiempoOriginal)).toEqual(base.tomas.map((t) => t.tiempoOriginal))
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
