import { describe, it, expect } from 'vitest'
import { TIMELINE_VACIO } from './motion'
import { z } from 'zod'
import { buildForensicInstruction, ForensicReportSchema, repairCutTiming, mergeMicroCortes, muestraPersona, corteMuestraPersona, CPS_MAX, type ForensicReport, type Corte, enProsa, limpiarDialogo, verificarHablantes, unirTomasContinuas, reconciliarConVentana, coreografiaEscasa, MIN_TOMA_SEG, ObjetoEnManoSchema, MicroSchema, CorteSchema , verificarDialogos, verificarAcciones, VERBOS_ACCION, buildMotionRefinementInstruction } from './forensic'

// El prompt es el contrato con Gemini. Estos asserts fijan las reglas del spec que,
// si se caen, producen el bug que ya vimos en producción: cortes inventados por
// cambio de diálogo y subtítulos tratados como contenido.

describe('buildForensicInstruction', () => {
  const p = buildForensicInstruction()

  it('prohíbe partir una toma continua por cambio de diálogo', () => {
    expect(p).toContain('cambio visual real o un corte de edición')
    expect(p).toMatch(/no dividas.*toma continua/i)
  })

  it('exige transcripción literal con sus errores', () => {
    expect(p).toMatch(/literal/i)
    expect(p).toContain('[inaudible]')
    expect(p).toMatch(/no resumir|no corregir|no parafrasear/i)
  })

  it('pide los gráficos SOLO para entender el original', () => {
    expect(p).toMatch(/no deben reproducirse/i)
  })

  it('prohíbe inferir etnia y acento', () => {
    expect(p).toMatch(/nunca infieras|no infieras/i)
    expect(p).toMatch(/raza|etnia/i)
    expect(p).toMatch(/acento/i)
  })

  // El render reconstruye un video: "muestra el producto" hace que el generador invente
  // un gesto y el resultado deje de parecerse al original. Caso real: el forense capturó
  // el gotero y el giro del frasco, pero el nivel de detalle no estaba exigido.
  it('exige coreografía de manos, no un resumen de la acción', () => {
    expect(p).toMatch(/qué mano usa y cómo agarra/i)
    expect(p).toMatch(/ENTRA al cuadro/i)
    expect(p).toMatch(/mano libre/i)
    expect(p).toContain('"shows the product" es inservible')
  })

  // ⚠️ EL CONTRATO DE IDIOMA ES DE DOS MITADES Y LAS DOS TIENEN QUE ESTAR NOMBRADAS.
  // Lo que se DICE va en español porque es una transcripción y porque se pronuncia; lo
  // técnico va en inglés porque se emite íntegro en el prompt del render, que va en
  // inglés. Con una sola mitad escrita el prompt se contradice —el modo de fallo que este
  // repo registra seis veces— o el render vuelve a quedar mitad y mitad.
  it('declara las DOS mitades del contrato de idioma', () => {
    const bloque = p.slice(p.indexOf('IDIOMA DE LA SALIDA'))
    expect(bloque).toBeTruthy()
    for (const esp of ['guionOriginal', 'dialogo', 'textoOverlay', 'resumenParaUsuario']) {
      expect(bloque.slice(0, bloque.indexOf('EN INGLÉS'))).toContain(esp)
    }
    for (const ing of ['accion', 'camara', 'micro', 'objetoEnMano', 'vestuario', 'fondo']) {
      expect(bloque.slice(bloque.indexOf('EN INGLÉS'))).toContain(ing)
    }
    expect(p).toMatch(/no lo traduzcas/i)
  })

  // El centinela que `corteMuestraPersona` compara de forma EXACTA. Si el prompt pide
  // otra cosa que lo que el código busca, un flat-lay se fusiona con un plano de persona.
  it('pide el marcador de ausencia exacto que el código compara', () => {
    expect(p).toContain('not visible')
    expect(p).toMatch(/EXACTAMENTE `not visible`/)
  })

  // El análisis devolvía los límites cuadrados en una rejilla de 5 s y con diálogos que
  // no caben en su propio corte. El prompt es una pasada; lo que lo hace cumplir es
  // `repairCutTiming`.
  it('prohíbe la rejilla de segundos redondos y exige diálogo decible', () => {
    expect(p).toMatch(/decimales/i)
    expect(p).toMatch(/rejilla/i)
    expect(p).toMatch(/SE PUEDA DECIR/)
    expect(p).toContain(String(CPS_MAX))
  })
})

// La columna vertebral de todo el sistema: la duración de cada corte es la que termina
// pidiéndosele a KIE. En la sesión real el TOTAL era creíble (776 car / 46 s = 16.9 cps)
// pero el reparto no: el corte 2 traía 60 caracteres en 2 s = 30 cps, indecible.
describe('repairCutTiming', () => {
  const corte = (n: number, duracionSeg: number, dialogo: string) => ({
    n, duracionSeg, dialogo,
    tiempo: `00:${String(n).padStart(2, '0')} - 00:${String(n + 1).padStart(2, '0')}`,
    accion: 'a', camara: 'c', textoOverlay: 'No aparece', transicion: 'corte directo', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
  })
  const informe = (cortes: ReturnType<typeof corte>[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((n, c) => n + c.duracionSeg, 0),
    caracteresGuion: cortes.reduce((n, c) => n + c.dialogo.length, 0),
    guionOriginal: cortes.map((c) => c.dialogo).join(' '),
    sujeto: '', vestuario: '', producto: '', fondo: '', elementosGraficos: '',
    cortes,
    tomas: cortes.map((c) => ({
      n: c.n, encuadre: '', posicion: 'x', accionFisica: '', objeto: '',
      dialogo: c.dialogo, duracionSeg: c.duracionSeg,
    })),
    edicion: { sincronizacion: '', textoOverlay: '', escalaZoom: '', cortes: '', ritmo: '', corteFinal: '' },
    resumenParaUsuario: '',
  })
  const cps = (c: { dialogo: string; duracionSeg: number }) => c.dialogo.length / c.duracionSeg

  // Un dato bueno no se toca: se devuelve el MISMO objeto, sin copiar ni recalcular.
  it('no toca un informe cuyos cortes ya son decibles', () => {
    const sano = informe([corte(1, 5, 'x'.repeat(70)), corte(2, 5, 'y'.repeat(60))])
    const r = repairCutTiming(sano)
    expect(r.ajustes).toEqual([])
    expect(r.report).toBe(sano)
  })

  it('baja el corte imposible exactamente al techo, no a un valor apenas mejor', () => {
    const { report } = repairCutTiming(informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))]))
    expect(cps(report.cortes[0])).toBeCloseTo(CPS_MAX, 6)
    expect(report.cortes[0].duracionSeg).toBeCloseTo(3, 6)
  })

  // Lo que hace que la reparación sea conservadora: el ritmo global del original no se
  // altera porque el tiempo sale de donde sobra, no de la nada.
  it('conserva el total exacto: el tiempo sale de los cortes con holgura', () => {
    const antes = informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40)), corte(3, 8, 'v'.repeat(20))])
    const { report } = repairCutTiming(antes)
    const suma = report.cortes.reduce((n, c) => n + c.duracionSeg, 0)
    expect(suma).toBeCloseTo(20, 9)
    expect(report.duracionTotalSeg).toBe(20)
    // Los dos holgados ceden en proporción a su holgura, no a partes iguales.
    expect(report.cortes[1].duracionSeg).toBeLessThan(10)
    expect(report.cortes[2].duracionSeg).toBeLessThan(8)
  })

  it('ningún corte queda por debajo de su mínimo después de repartir', () => {
    const { report } = repairCutTiming(informe([
      corte(1, 1, 'a'.repeat(60)), corte(2, 1, 'b'.repeat(50)), corte(3, 20, 'c'.repeat(30)),
    ]))
    for (const c of report.cortes) expect(cps(c)).toBeLessThanOrEqual(CPS_MAX + 1e-9)
  })

  // El texto entero no entra en la duración del video: no hay de dónde sacar tiempo, así
  // que el total crece. Es el ÚNICO caso en que `duracionTotalSeg` se mueve.
  it('si no hay holgura en todo el video, el total crece y se reporta', () => {
    const { report } = repairCutTiming(informe([corte(1, 1, 'a'.repeat(60)), corte(2, 1, 'b'.repeat(60))]))
    expect(report.duracionTotalSeg).toBeCloseTo(6, 6)
    for (const c of report.cortes) expect(cps(c)).toBeCloseTo(CPS_MAX, 6)
  })

  // `tiempo` apunta a DÓNDE estaba el corte en el video fuente — el spec lo trata como
  // campo distinto de la duración. Además es la clave con la que `camaraDeLote` empareja
  // lote y plano, y entra en `scriptFingerprint`: moverla rompería las dos cosas.
  it('nunca toca la marca `tiempo`', () => {
    const antes = informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))])
    const { report } = repairCutTiming(antes)
    expect(report.cortes.map((c) => c.tiempo)).toEqual(antes.cortes.map((c) => c.tiempo))
  })

  it('sincroniza las duraciones de `tomas` con las de `cortes`', () => {
    const { report } = repairCutTiming(informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))]))
    expect(report.tomas.map((t) => t.duracionSeg)).toEqual(report.cortes.map((c) => c.duracionSeg))
  })

  it('deja `tomas` en paz si no hay una por corte', () => {
    const raro = { ...informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))]) }
    raro.tomas = [raro.tomas[0]]
    expect(repairCutTiming(raro).report.tomas).toHaveLength(1)
  })

  // Sin esto, el error de coma flotante del reparto puede dejar un corte una billonésima
  // por debajo de su mínimo y una segunda pasada lo movería otra vez — dos huellas
  // distintas para el mismo contenido.
  it('es idempotente: la segunda pasada no mueve nada', () => {
    const uno = repairCutTiming(informe([
      corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(137)), corte(3, 3.7, 'v'.repeat(41)), corte(4, 8, 'u'.repeat(19)),
    ])).report
    const dos = repairCutTiming(uno)
    expect(dos.ajustes).toEqual([])
    expect(dos.report.cortes.map((c) => c.duracionSeg)).toEqual(uno.cortes.map((c) => c.duracionSeg))
  })

  it('reporta qué cortes movió y desde dónde', () => {
    const { ajustes } = repairCutTiming(informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, 'w'.repeat(40))]))
    expect(ajustes.find((a) => a.n === 1)).toMatchObject({ n: 1, de: 2 })
    expect(ajustes.find((a) => a.n === 1)!.a).toBeCloseTo(3, 6)
  })

  it('un corte sin diálogo no exige nada y conserva su duración de acción', () => {
    const { report } = repairCutTiming(informe([corte(1, 2, 'z'.repeat(60)), corte(2, 10, '')]))
    expect(report.cortes[1].duracionSeg).toBeCloseTo(9, 6)
  })

  it('sin diálogo en ningún corte no hay nada que reparar', () => {
    const mudo = informe([corte(1, 3, ''), corte(2, 4, '')])
    expect(repairCutTiming(mudo).report).toBe(mudo)
  })

  // Duraciones degeneradas: el saneo real vive en `sanearDuracion` (lotes.ts), pero esto
  // corre antes y no puede ser lo que reviente.
  it('no revienta con duraciones cero, negativas o no finitas', () => {
    const roto = informe([corte(1, 0, 'z'.repeat(20)), corte(2, -3, 'w'.repeat(10)), corte(3, 10, 'v'.repeat(10))])
    roto.cortes[1].duracionSeg = NaN
    const { report } = repairCutTiming(roto)
    for (const c of report.cortes) expect(Number.isFinite(c.duracionSeg)).toBe(true)
  })
})

describe('ForensicReportSchema', () => {
  it('acepta un informe completo', () => {
    const ok = ForensicReportSchema.safeParse({
      duracionTotalSeg: 28.3,
      caracteresGuion: 412,
      guionOriginal: 'este suero de niacinamida de anua y tengo que contarte',
      sujeto: 'Mujer de unos 25, cabello oscuro recogido, piel clara, ojos claros',
      vestuario: 'Polo azul marino con estampado de oso, pulsera dorada',
      producto: 'Frasco de vidrio rojo con gotero, etiqueta blanca',
      fondo: 'Dormitorio, pared clara, repisas blancas al fondo',
      elementosGraficos: 'Subtítulos blancos centrados abajo; marca de agua de TikTok',
      cortes: [{
        n: 1, tiempo: '00:00 - 00:03', duracionSeg: 3,
        accion: 'Sostiene el frasco frente a la cámara',
        camara: 'Primer plano, altura de ojos, cámara en mano',
        dialogo: 'este suero de niacinamida', textoOverlay: 'este suero de niacinamida',
        transicion: 'corte directo', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
      }],
      tomas: [{
        n: 1, encuadre: 'Primer plano', posicion: 'Frente a cámara',
        accionFisica: 'Levanta el frasco', objeto: 'Frasco de suero',
        dialogo: 'este suero de niacinamida', duracionSeg: 3,
      }],
      edicion: {
        sincronizacion: 'Acción sincronizada con cada frase',
        textoOverlay: 'Subtítulos quemados en todo el video',
        escalaZoom: 'Sin zoom', cortes: 'Jump cuts secos',
        ritmo: 'Rápido, sin silencios', corteFinal: 'Placa de cierre de TikTok',
      },
      resumenParaUsuario: 'Testimonio en primera persona con demostración de uso.',
    })
    expect(ok.success).toBe(true)
  })

  it('rechaza un informe sin cortes', () => {
    expect(ForensicReportSchema.safeParse({ cortes: [] }).success).toBe(false)
  })
})

/**
 * FUSIÓN DE MICRO-CORTES.
 *
 * Nace del UGC de ropa: 29 cortes en 28 s, ~1 s cada uno. Con la frontera de plano eso
 * da 24 lotes de un segundo — 12× el costo del video de suero, y clips que el generador
 * no puede llenar con nada. Fusionar da 7 lotes de 3–5 s conservando UN encuadre por
 * clip, que es lo que lo distingue de `maxPlanos > 1`: ahí el clip recibe dos encuadres
 * y el modelo renderiza uno, perdiendo el otro en silencio.
 */
describe('mergeMicroCortes', () => {
  const corte = (n: number, dur: number, camara: string, dialogo = `frase ${n}`) => ({
    n, tiempo: `00:${String(n).padStart(2, '0')} - 00:${String(n + 1).padStart(2, '0')}`,
    duracionSeg: dur, accion: `accion ${n}`, camara, dialogo, textoOverlay: 'No aparece', transicion: 'corte directo', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
  })
  const rep = (cortes: ReturnType<typeof corte>[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((a, c) => a + c.duracionSeg, 0),
    caracteresGuion: cortes.reduce((a, c) => a + c.dialogo.length, 0),
    guionOriginal: cortes.map((c) => c.dialogo).join(' '),
    sujeto: 'x', vestuario: 'x', producto: 'x', fondo: 'x', elementosGraficos: 'x',
    cortes,
    tomas: cortes.map((c) => ({ n: c.n, encuadre: c.camara, posicion: 'x', accionFisica: c.accion, objeto: 'x', dialogo: c.dialogo, duracionSeg: c.duracionSeg })),
    edicion: { sincronizacion: 'x', textoOverlay: 'x', escalaZoom: 'x', cortes: 'x', ritmo: 'x', corteFinal: 'x' },
    resumenParaUsuario: 'x',
  })

  it('no toca un video cuyos cortes ya llegan al piso — devuelve el MISMO objeto', () => {
    const r = rep([corte(1, 5, 'A'), corte(2, 4, 'B')])
    const out = mergeMicroCortes(r, 3)
    expect(out.report).toBe(r)
    expect(out.fusiones).toHaveLength(0)
  })

  // Un video sin cortes (cabeza parlante de una pasada) no tiene vecino con quien
  // fusionar: se queda como está aunque sea corto.
  it('un solo corte se queda solo', () => {
    const r = rep([corte(1, 1, 'A')])
    expect(mergeMicroCortes(r, 3).report).toBe(r)
  })

  it('fusiona hasta que todo llega al piso y conserva la duración total', () => {
    const r = rep([corte(1, 1, 'A'), corte(2, 1, 'B'), corte(3, 1, 'C'), corte(4, 1, 'D'), corte(5, 4, 'E')])
    const { report: out, fusiones } = mergeMicroCortes(r, 3)
    expect(out.cortes.length).toBeLessThan(5)
    for (const c of out.cortes) expect(c.duracionSeg).toBeGreaterThanOrEqual(3)
    expect(out.cortes.reduce((a, c) => a + c.duracionSeg, 0)).toBeCloseTo(8, 6)
    expect(fusiones.length).toBeGreaterThan(0)
  })

  // Nada de texto se pierde: es lo que hace que el ritmo (caracteres por segundo) no se
  // altere, porque suma texto y suma duración en la misma proporción.
  it('no pierde ni una palabra del diálogo ni de la acción', () => {
    const r = rep([corte(1, 1, 'A'), corte(2, 1, 'B'), corte(3, 5, 'C')])
    const { report: out } = mergeMicroCortes(r, 3)
    const dicho = out.cortes.map((c) => c.dialogo).join(' ')
    for (const n of [1, 2, 3]) {
      expect(dicho).toContain(`frase ${n}`)
      expect(out.cortes.map((c) => c.accion).join(' ')).toContain(`accion ${n}`)
    }
  })

  // El encuadre que sobrevive es el del corte más LARGO: es el que aporta más segundos
  // de imagen. Lo contrario haría que un flash de 0.5s decida el plano de toda la toma.
  it('el encuadre que sobrevive es el del corte más largo', () => {
    const { report: out } = mergeMicroCortes(rep([corte(1, 0.5, 'FLASH'), corte(2, 2.6, 'DOMINANTE')]), 3)
    expect(out.cortes).toHaveLength(1)
    expect(out.cortes[0].camara).toBe('DOMINANTE')
  })

  it('renumera y mantiene tomas emparejadas 1-a-1 con cortes', () => {
    const { report: out } = mergeMicroCortes(rep([corte(1, 1, 'A'), corte(2, 1, 'B'), corte(3, 1, 'C'), corte(4, 4, 'D')]), 3)
    expect(out.tomas).toHaveLength(out.cortes.length)
    expect(out.cortes.map((c) => c.n)).toEqual(out.cortes.map((_, i) => i + 1))
    for (const [i, t] of out.tomas.entries()) expect(t.duracionSeg).toBe(out.cortes[i].duracionSeg)
  })

  // Sin esto, dos pasadas darían dos listas de cortes distintas y por tanto dos huellas
  // distintas para el mismo contenido (`scriptFingerprint` hashea `tiempo` por toma).
  it('es idempotente', () => {
    const { report: una } = mergeMicroCortes(rep([corte(1, 1, 'A'), corte(2, 1, 'B'), corte(3, 4, 'C')]), 3)
    expect(mergeMicroCortes(una, 3).report).toBe(una)
  })

  // Fusionar une los diálogos con un espacio: suma un carácter sin sumar duración, así
  // que un corte que estaba justo en el techo queda por encima. Componer con
  // `repairCutTiming` lo devuelve al techo — medido, 20.6 → 20.0 cps.
  it('compuesta con repairCutTiming ningún corte queda por encima del techo de cps', () => {
    const r = rep([
      { ...corte(1, 1, 'A'), dialogo: 'x'.repeat(20) },
      { ...corte(2, 1, 'B'), dialogo: 'y'.repeat(20) },
      { ...corte(3, 6, 'C'), dialogo: 'z'.repeat(10) },
    ])
    const { report: fus } = mergeMicroCortes(r, 3)
    const { report: fin } = repairCutTiming(fus)
    for (const c of fin.cortes) expect(c.dialogo.length / c.duracionSeg).toBeLessThanOrEqual(CPS_MAX + 1e-9)
  })
})

/**
 * Un corte SIN diálogo tiene mínimo de cps 0, o sea es holgura pura, y el reparto lo
 * puede vaciar entero para financiar a los que no entran. Medido en una sesión real de
 * ropa, después de fusionar los micro-cortes a 3 s: las dos tomas de cierre —las únicas
 * mudas— quedaron en 0.91 s y 1.27 s, deshaciendo justo lo que la fusión garantizaba.
 * Dos clips de 1 s son dos llamadas pagadas por un plano congelado.
 */
describe('repairCutTiming — piso de duración visible', () => {
  const c = (n: number, dur: number, dialogo: string) => ({
    n, tiempo: `t${n}`, duracionSeg: dur, accion: 'a', camara: 'A', dialogo,
    textoOverlay: 'No aparece', transicion: 'corte', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
  })
  const rep = (cortes: ReturnType<typeof c>[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((a, x) => a + x.duracionSeg, 0), caracteresGuion: 0,
    guionOriginal: 'x', sujeto: 'x', vestuario: 'x', producto: 'x', fondo: 'x', elementosGraficos: 'x',
    cortes,
    tomas: cortes.map((x) => ({ n: x.n, encuadre: 'A', posicion: 'x', accionFisica: 'a', objeto: 'x', dialogo: x.dialogo, duracionSeg: x.duracionSeg })),
    edicion: { sincronizacion: 'x', textoOverlay: 'x', escalaZoom: 'x', cortes: 'x', ritmo: 'x', corteFinal: 'x' },
    resumenParaUsuario: 'x',
  })
  // Un corte hablado que no entra (200 caracteres necesitan 10s y tiene 2) junto a dos
  // mudos de 4s: la holgura de los mudos es lo único que puede financiar el déficit.
  const roto = () => rep([c(1, 2, 'x'.repeat(200)), c(2, 4, ''), c(3, 4, '')])

  it('sin piso los cortes mudos se vacían — comportamiento de siempre, default 0', () => {
    const { report } = repairCutTiming(roto())
    expect(Math.min(...report.cortes.map((x) => x.duracionSeg))).toBeLessThan(3)
    expect(repairCutTiming(roto(), 0).report).toEqual(report)
  })

  it('con piso ningún corte baja de él, ni siquiera los mudos', () => {
    const { report } = repairCutTiming(roto(), 3)
    for (const x of report.cortes) expect(x.duracionSeg).toBeGreaterThanOrEqual(3 - 1e-9)
  })

  // Si los pisos no caben en la duración original, el total crece: es el mismo caso que
  // "el texto entero no entra", el único en que `duracionTotalSeg` se mueve.
  it('el total solo crece cuando los pisos no caben', () => {
    const r = roto()
    const original = r.cortes.reduce((a, x) => a + x.duracionSeg, 0)
    const { report } = repairCutTiming(r, 3)
    expect(report.cortes.reduce((a, x) => a + x.duracionSeg, 0)).toBeGreaterThanOrEqual(original - 1e-9)
  })

  it('sigue siendo idempotente con piso', () => {
    const una = repairCutTiming(roto(), 3).report
    expect(repairCutTiming(una, 3).report).toBe(una)
  })
})

/**
 * NO SE FUSIONA A TRAVÉS DE UN PLANO SIN PERSONA.
 *
 * Medido en el render real de ropa (`430c5961`): el lote 1 encadenó cuatro cortes con
 * "Luego," e incluía un flat-lay —la blusa extendida sobre el suelo, sin nadie— entre
 * dos planos de la modelo. El render lo reprodujo con fidelidad: tres sub-tomas con
 * fondos distintos dentro de un clip que `CONTINUIDAD` declaraba invariante. El modelo
 * hizo lo pedido; lo que estaba mal era pedirle un montaje dentro de un plano continuo.
 */
describe('muestraPersona', () => {
  it('reconoce a la persona aunque el texto venga sin acentos o con otra palabra', () => {
    for (const t of ['La mujer, de pie, mira a la camara', 'Primer plano de las manos de la MUJER',
                     'El hombre sostiene el frasco', 'La modelo posa de perfil', 'La joven señora sonríe'])
      expect(muestraPersona(t)).toBe(true)
  })

  it('un flat-lay no cuenta como persona aunque aparezca una mano suelta', () => {
    expect(muestraPersona('La camisa crema está extendida sobre un suelo de baldosas claras. Una mano de piel clara entra por la parte superior derecha del cuadro.')).toBe(false)
    expect(muestraPersona('Plano cenital del producto sobre una mesa de madera.')).toBe(false)
  })
})

describe('mergeMicroCortes — no cruza la frontera persona/producto', () => {
  const c = (n: number, dur: number, accion: string) => ({
    n, tiempo: `t${n}`, duracionSeg: dur, accion, camara: `C${n}`, dialogo: '',
    textoOverlay: 'No aparece', transicion: 'corte', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
  })
  const rep = (cortes: ReturnType<typeof c>[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((a, x) => a + x.duracionSeg, 0), caracteresGuion: 0,
    guionOriginal: 'x', sujeto: 'x', vestuario: 'x', producto: 'x', fondo: 'x', elementosGraficos: 'x',
    cortes,
    tomas: cortes.map((x) => ({ n: x.n, encuadre: 'A', posicion: 'x', accionFisica: x.accion, objeto: 'x', dialogo: '', duracionSeg: x.duracionSeg })),
    edicion: { sincronizacion: 'x', textoOverlay: 'x', escalaZoom: 'x', cortes: 'x', ritmo: 'x', corteFinal: 'x' },
    resumenParaUsuario: 'x',
  })
  const P = 'La mujer muestra la prenda'
  const F = 'La prenda está extendida sobre el suelo'

  it('un flat-lay corto queda SOLO en vez de meterse dentro de un plano de persona', () => {
    const { report } = mergeMicroCortes(rep([c(1, 1, P), c(2, 1, F), c(3, 1, P), c(4, 1, P)]), 3)
    const conFlat = report.cortes.filter((x) => x.accion.includes('extendida'))
    expect(conFlat).toHaveLength(1)
    // …y no arrastró la acción de ningún plano de persona.
    expect(conFlat[0].accion).not.toContain('La mujer')
  })

  it('sí fusiona dos planos de producto contiguos entre sí', () => {
    const { report } = mergeMicroCortes(rep([c(1, 1, F), c(2, 1, F), c(3, 1, F), c(4, 5, P)]), 3)
    expect(report.cortes).toHaveLength(2)
    expect(report.cortes[0].duracionSeg).toBeCloseTo(3, 6)
  })

  // Sin vecino compatible no hay fusión posible: el corte se queda corto, que es lo
  // correcto —es una toma distinta— y el bucle tiene que TERMINAR en vez de girar.
  it('termina aunque queden cortes bajo el piso sin con quién fusionarse', () => {
    const { report } = mergeMicroCortes(rep([c(1, 1, P), c(2, 1, F), c(3, 5, P)]), 3)
    expect(report.cortes).toHaveLength(3)
    expect(report.cortes[0].duracionSeg).toBe(1)
  })
})

/**
 * El piso de `repairCutTiming` es un suelo contra el vaciado, NO un empujón hacia
 * arriba: un corte que la fusión dejó corto a propósito (un flat-lay aislado) no debe
 * inflarse hasta el piso. Medido en la sesión de ropa: sin acotar, los 28 s del
 * original se iban a 41,8 s.
 */
describe('repairCutTiming — el piso no infla', () => {
  const c = (n: number, dur: number, dialogo: string) => ({
    n, tiempo: `t${n}`, duracionSeg: dur, accion: 'a', camara: 'A', dialogo,
    textoOverlay: 'No aparece', transicion: 'corte', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
  })
  const rep = (cortes: ReturnType<typeof c>[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((a, x) => a + x.duracionSeg, 0), caracteresGuion: 0,
    guionOriginal: 'x', sujeto: 'x', vestuario: 'x', producto: 'x', fondo: 'x', elementosGraficos: 'x',
    cortes,
    tomas: cortes.map((x) => ({ n: x.n, encuadre: 'A', posicion: 'x', accionFisica: 'a', objeto: 'x', dialogo: x.dialogo, duracionSeg: x.duracionSeg })),
    edicion: { sincronizacion: 'x', textoOverlay: 'x', escalaZoom: 'x', cortes: 'x', ritmo: 'x', corteFinal: 'x' },
    resumenParaUsuario: 'x',
  })

  it('un corte más corto que el piso se queda como está — no crece', () => {
    const { report } = repairCutTiming(rep([c(1, 1.2, ''), c(2, 6, 'x'.repeat(60))]), 3)
    expect(report.cortes[0].duracionSeg).toBeCloseTo(1.2, 6)
  })

  it('pero tampoco se lo vacía para financiar a otro', () => {
    const { report } = repairCutTiming(rep([c(1, 1.2, ''), c(2, 2, 'x'.repeat(200))]), 3)
    expect(report.cortes[0].duracionSeg).toBeCloseTo(1.2, 6)
  })
})

/**
 * Gemini devuelve objetos y arrays en campos declarados `z.string()` y el schema los
 * coacciona a un string con JSON adentro. Eso viajaba crudo al prompt de render.
 */
describe('enProsa', () => {
  it('aplana un objeto a prosa, sin llaves ni nombres de campo', () => {
    const fondo = JSON.stringify({
      localizacionAparente: 'Interior, habitación con pared lisa',
      paredes: 'Lisas, color crema',
      iluminacion: 'Luz suave y uniforme',
    })
    const p = enProsa(fondo)
    expect(p).toBe('Interior, habitación con pared lisa. Lisas, color crema. Luz suave y uniforme.')
    expect(p).not.toMatch(/[{}"]|localizacionAparente/)
  })

  it('aplana un array de objetos — la forma real de `vestuario`', () => {
    const vestuario = JSON.stringify([
      { prenda: 'Camisa de manga larga', colores: 'Crema' },
      { prenda: 'Pantalón', colores: 'Negro' },
    ])
    expect(enProsa(vestuario)).toBe('Camisa de manga larga. Crema. Pantalón. Negro.')
  })

  // ⚠️ El defecto grave. En un prompt de UN clip, una descripción que empieza "En un
  // corte…" es una lista de escenarios alternativos, y el modelo elige uno: de ahí salió
  // el sillón que apareció en un clip de la prueba de ropa.
  it('descarta lo que describe OTROS cortes', () => {
    const fondo = JSON.stringify({
      paredes: 'Lisas, color crema',
      muebles: 'En un corte, se observa un sillón tapizado en tela gris claro',
      superficies: 'En algunos cortes se ve un suelo de baldosas',
    })
    const p = enProsa(fondo)
    expect(p).toBe('Lisas, color crema.')
    expect(p).not.toMatch(/sillón|baldosas/)
  })

  it('un texto que ya es prosa vuelve intacto, y lo vacío se queda vacío', () => {
    expect(enProsa('Dormitorio con luz natural.')).toBe('Dormitorio con luz natural.')
    expect(enProsa('')).toBe('')
    expect(enProsa(null)).toBe('')
  })

  it('un JSON corrupto se devuelve tal cual en vez de perderse', () => {
    expect(enProsa('{no es json')).toBe('{no es json')
  })
})

/**
 * ⚠️ FALLO MEDIDO EN LA SESIÓN `02fa1205`. El prompt de FASE 1 pide `textoOverlay` "(o
 * 'No aparece')" y el modelo generaliza ese marcador a `dialogo` en los cortes mudos.
 * FASE 2 y 3 lo copian literal —que es lo que deben hacer— y llega al prompt del lote
 * como `Locución:`, o sea el generador de video LO DICE EN VOZ ALTA. En el guión final
 * del usuario salieron tres "No aparece." seguidas.
 */
describe('limpiarDialogo', () => {
  it('vacía un corte mudo cuyo diálogo es solo el marcador, repetido', () => {
    expect(limpiarDialogo('No aparece. No aparece.')).toBe('')
    expect(limpiarDialogo('No aparece.')).toBe('')
  })

  it('quita el marcador pegado al final de una frase real y conserva la frase', () => {
    expect(limpiarDialogo('Y es nuestro Top Mei. No aparece.')).toBe('Y es nuestro Top Mei.')
  })

  it('NO se come diálogo legítimo que contenga esas palabras dentro de una oración', () => {
    // El acote es a frases COMPLETAS: el modo de fallo es dejar pasar un marcador raro,
    // no borrar algo que el personaje sí dice.
    const real = 'Después de dos semanas la mancha ya no aparece.'
    expect(limpiarDialogo(real)).toBe(real)
  })

  it('tolera acentos, mayúsculas y las otras formas del marcador', () => {
    expect(limpiarDialogo('SIN DIÁLOGO.')).toBe('')
    expect(limpiarDialogo('Silencio. Hola a todas.')).toBe('Hola a todas.')
  })

  it('un diálogo limpio vuelve intacto', () => {
    const t = 'La tendencia asiática llegó y este es el nuevo ingreso.'
    expect(limpiarDialogo(t)).toBe(t)
  })
})

/**
 * VARIOS PERSONAJES (slice 2). El desglose por hablante es texto libre del modelo: nada
 * le impide resumir, reordenar o inventar. Lo único verificable en código es que las
 * palabras concatenadas reproduzcan el diálogo del corte.
 *
 * Lo que NO se puede verificar es a QUIÉN se le asignó cada tramo — para eso hace falta
 * el audio. Por eso el fallo se resuelve DESCARTANDO la atribución de ese corte: quedarse
 * sin atribución es el comportamiento de siempre y es seguro; atribuir mal le pondría la
 * línea de un personaje a otro sin que nada lo reporte.
 */
describe('verificarHablantes', () => {
  const corte = (over: Record<string, unknown> = {}) => ({
    n: 1, tiempo: '00:00 - 00:05', duracionSeg: 5, accion: 'a', camara: 'plano medio',
    dialogo: 'Tome, doctorcito. No se preocupe por eso.',
    textoOverlay: 'No aparece', transicion: 'corte', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO, ...over,
  })
  const rep = (cortes: unknown[]) => ({ cortes, tomas: [] } as never)

  it('acepta un reparto que reproduce el diálogo', () => {
    const r = verificarHablantes(rep([corte({
      hablantes: [
        { personaje: 'P2', texto: 'Tome, doctorcito.' },
        { personaje: 'P1', texto: 'No se preocupe por eso.' },
      ],
    })]))
    expect(r.descartados).toEqual([])
    expect(r.report.cortes[0].hablantes).toHaveLength(2)
  })

  it('tolera puntuación y acentos movidos al partir la frase', () => {
    // El modelo suele mover una coma; rechazar por eso tiraría un reparto correcto.
    const r = verificarHablantes(rep([corte({
      hablantes: [
        { personaje: 'P2', texto: 'Tome doctorcito' },
        { personaje: 'P1', texto: '¡No se preocupe por eso!' },
      ],
    })]))
    expect(r.descartados).toEqual([])
  })

  it('DESCARTA el reparto que inventa o pierde texto, y conserva el diálogo', () => {
    const r = verificarHablantes(rep([corte({
      hablantes: [{ personaje: 'P2', texto: 'Tome, doctorcito. Dios se lo pague.' }],
    })]))
    expect(r.descartados).toEqual([1])
    expect(r.report.cortes[0].hablantes).toBeUndefined()
    expect(r.report.cortes[0].dialogo).toBe('Tome, doctorcito. No se preocupe por eso.')
  })

  it('descarta también si se pierde una parte', () => {
    const r = verificarHablantes(rep([corte({
      hablantes: [{ personaje: 'P1', texto: 'Tome, doctorcito.' }],
    })]))
    expect(r.descartados).toEqual([1])
  })

  it('un corte sin atribución pasa intacto — es el caso de toda sesión anterior', () => {
    const antes = rep([corte()])
    expect(verificarHablantes(antes).report).toBe(antes)
  })
})

describe('el prompt de FASE 1 pide personajes y atribución', () => {
  const p = buildForensicInstruction()

  it('pide la lista de personajes con id estable', () => {
    expect(p).toMatch(/`personajes`/)
    expect(p).toMatch(/hasta 4/)
    expect(p).toMatch(/estable y no repetirse/)
  })

  it('exige que el reparto no cambie una palabra, y dice qué pasa si no', () => {
    expect(p).toMatch(/NO cambies ni una palabra/)
    expect(p).toMatch(/se descarta el reparto/)
  })

  it('mantiene la prohibición de etiquetar etnia también en los personajes', () => {
    expect(p).toMatch(/SIN etiquetar etnia ni origen cultural/)
  })
})

/**
 * ⚠️ FALSO POSITIVO MEDIDO con el anuncio de calzado. El forense describe un plano de
 * producto como "Detalle del zapato, SIN PERSONA en cuadro" y la búsqueda por palabra lo
 * leía como plano de PERSONA — al revés. Un flat-lay mal clasificado se fusiona con planos
 * de persona y comparte fotograma con ellos, que es justo lo que esta función evita.
 */
describe('muestraPersona — la negación manda', () => {
  it('no lee como persona lo que dice explícitamente que no la hay', () => {
    expect(muestraPersona('Detalle del zapato beige con lazo, sin persona en cuadro')).toBe(false)
    expect(muestraPersona('Plano cenital del producto, no aparece nadie')).toBe(false)
    expect(muestraPersona('La prenda extendida, no se ve a la modelo')).toBe(false)
  })

  it('sigue reconociendo los planos de persona de siempre', () => {
    expect(muestraPersona('Primer plano de los pies de la modelo calzando los tacones')).toBe(true)
    expect(muestraPersona('La mujer levanta la mano y mira a la cámara')).toBe(true)
  })

  it('un plano sin personas mencionadas sigue siendo de producto', () => {
    expect(muestraPersona('Placa final con el logotipo de la marca sobre fondo blanco')).toBe(false)
  })
})

describe('unirTomasContinuas', () => {
  const micro = { cuerpo: 'quieto', manos: 'sube', rostro: 'sonríe', cabello: 'fijo', entorno: 'nada' }
  const corte = (n: number, p: Partial<Corte> = {}): Corte => ({
    n, tiempo: `00:0${n - 1} - 00:0${n}`, duracionSeg: 3,
    accion: 'La mujer sostiene el frasco', camara: 'Primer plano', dialogo: `linea ${n}`,
    textoOverlay: 'No aparece', transicion: 'corte directo',
    objetoEnMano: { inicio: 'frasco', fin: 'frasco', accesorios: '' }, micro, motion: TIMELINE_VACIO,
    ...p,
  })
  const base = (cortes: Corte[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((n, c) => n + c.duracionSeg, 0),
    caracteresGuion: 0, guionOriginal: '', sujeto: '', vestuario: '', producto: '', fondo: '',
    elementosGraficos: '', cortes,
    tomas: cortes.map((c) => ({ n: c.n, encuadre: '', posicion: 'x', accionFisica: '', objeto: '', dialogo: c.dialogo, duracionSeg: c.duracionSeg })),
    edicion: { sincronizacion: '', textoOverlay: '', escalaZoom: '', cortes: '', ritmo: '', corteFinal: '' },
    resumenParaUsuario: '',
  })

  it('une cortes consecutivos que son la misma toma', () => {
    const { report, fusiones } = unirTomasContinuas(base([corte(1), corte(2)]), 15, 300)
    expect(report.cortes).toHaveLength(1)
    expect(report.cortes[0].duracionSeg).toBe(6)
    expect(report.cortes[0].tiempo).toBe('00:00 - 00:02')
    expect(report.cortes[0].dialogo).toBe('linea 1 linea 2')
    expect(fusiones).toHaveLength(1)
  })

  // ⚠️ LA CONDICIÓN QUE JUSTIFICA TODA LA FUNCIÓN. En el original ese salto es un corte
  // de montaje; dentro de un clip continuo es un gotero teletransportándose.
  it('NO une si lo que hay en la mano cambia entre un corte y el otro', () => {
    const a = corte(1, { objetoEnMano: { inicio: 'nada', fin: 'gotero', accesorios: '' } })
    const b = corte(2, { objetoEnMano: { inicio: 'nada', fin: 'nada', accesorios: '' } })
    expect(unirTomasContinuas(base([a, b]), 15, 300).report.cortes).toHaveLength(2)
  })

  it('tolera el artículo y las mayúsculas al comparar el objeto', () => {
    const a = corte(1, { objetoEnMano: { inicio: 'nada', fin: 'El frasco', accesorios: '' } })
    const b = corte(2, { objetoEnMano: { inicio: 'frasco', fin: 'frasco', accesorios: '' } })
    expect(unirTomasContinuas(base([a, b]), 15, 300).report.cortes).toHaveLength(1)
  })

  it('NO une planos distintos: la toma continua necesitaría un corte adentro', () => {
    expect(unirTomasContinuas(base([corte(1), corte(2, { camara: 'Plano medio' })]), 15, 300)
      .report.cortes).toHaveLength(2)
  })

  // ⚠️ La clase la DECLARA `micro` ("no aparece"), no la prosa de `accion`: el forense
  // escribe en telegrama y sin sujeto. Ver `corteMuestraPersona`.
  it('NO une un plano de persona con uno sin persona', () => {
    const b = corte(2, {
      accion: 'Detalle del frasco',
      micro: { cuerpo: 'no aparece', manos: 'sostienen el frasco', rostro: 'no aparece', cabello: 'no aparece', entorno: 'fondo quieto' },
    })
    expect(unirTomasContinuas(base([corte(1), b]), 15, 300).report.cortes).toHaveLength(2)
  })

  it('NO une voz en off con habla a cámara', () => {
    expect(unirTomasContinuas(base([corte(1), corte(2, { vozEnOff: true })]), 15, 300)
      .report.cortes).toHaveLength(2)
  })

  // Fail-closed: toda sesión analizada antes de que el campo existiera cae acá.
  it('sin objetoEnMano no une nada, y devuelve el MISMO objeto', () => {
    const r = base([corte(1, { objetoEnMano: undefined }), corte(2, { objetoEnMano: undefined })])
    const out = unirTomasContinuas(r, 15, 300)
    expect(out.report).toBe(r)
    expect(out.fusiones).toEqual([])
  })

  it('respeta el cap de segundos y el de caracteres', () => {
    const largos = [corte(1, { duracionSeg: 9 }), corte(2, { duracionSeg: 9 })]
    expect(unirTomasContinuas(base(largos), 15, 300).report.cortes).toHaveLength(2)
    const habladores = [corte(1, { dialogo: 'x'.repeat(200) }), corte(2, { dialogo: 'x'.repeat(200) })]
    expect(unirTomasContinuas(base(habladores), 15, 300).report.cortes).toHaveLength(2)
  })

  // ⚠️ Unir A+B habilita AB+C, así que una pasada no es un punto fijo — y dos listas de
  // cortes para el mismo contenido son dos scriptFingerprint distintas.
  it('converge y es idempotente', () => {
    const { report } = unirTomasContinuas(base([corte(1), corte(2), corte(3), corte(4)]), 15, 300)
    expect(report.cortes).toHaveLength(1)
    expect(report.cortes[0].duracionSeg).toBe(12)
    expect(unirTomasContinuas(report, 15, 300).report).toBe(report)
  })

  it('concatena el detalle atómico en vez de quedarse con la mitad', () => {
    const b = corte(2, { micro: { ...micro, manos: 'baja' } })
    const { report } = unirTomasContinuas(base([corte(1), b]), 15, 300)
    expect(report.cortes[0].micro?.manos).toBe('sube; después baja')
    expect(report.cortes[0].micro?.cuerpo).toBe('quieto')
  })

  it('la toma resultante abarca de la primera mano a la última', () => {
    const a = corte(1, { objetoEnMano: { inicio: 'nada', fin: 'frasco', accesorios: '' } })
    const b = corte(2, { objetoEnMano: { inicio: 'frasco', fin: 'frasco abierto', accesorios: '' } })
    const { report } = unirTomasContinuas(base([a, b]), 15, 300)
    expect(report.cortes[0].objetoEnMano).toEqual({ inicio: 'nada', fin: 'frasco abierto', accesorios: '' })
  })
})

describe('corteMuestraPersona', () => {
  const sin = { cuerpo: 'no aparece', manos: 'sostienen el frasco', rostro: 'no aparece', cabello: 'no aparece', entorno: 'fondo quieto' }
  const con = { cuerpo: 'torso erguido', manos: 'sube la mano', rostro: 'sonríe', cabello: 'fijo', entorno: 'quieto' }

  // ⚠️ EL CASO QUE LO MOTIVÓ, medido sobre una sesión real: el forense escribe la acción
  // en telegrama y SIN SUJETO, así que buscar "mujer" en la prosa da false para un plano
  // de persona evidente. Los tres cortes de esa sesión daban false.
  it('la acción en telegrama sin sujeto ya no engaña al clasificador', () => {
    const accion = 'Sujeta pipeta con mano derecha, aplica producto en mejilla, mira a cámara.'
    expect(muestraPersona(accion)).toBe(false)
    expect(corteMuestraPersona({ accion, micro: con })).toBe(true)
  })

  it('un plano de producto se declara sin persona', () => {
    expect(corteMuestraPersona({ accion: 'Detalle del frasco', micro: sin })).toBe(false)
  })

  // Un plano de manos sigue siendo plano de persona a efectos de continuidad y fotograma.
  it('basta con que UNA parte del cuerpo esté descrita', () => {
    expect(corteMuestraPersona({ accion: 'x', micro: { ...sin, cabello: 'cae sobre la cara' } })).toBe(true)
  })

  // Sin `micro` (toda sesión anterior) el comportamiento es exactamente el de antes.
  it('sin micro cae al heurístico de siempre', () => {
    expect(corteMuestraPersona({ accion: 'La mujer sostiene el frasco' })).toBe(true)
    expect(corteMuestraPersona({ accion: 'Detalle del zapato, sin persona en cuadro' })).toBe(false)
  })
})

describe('MicroSchema — por qué el .catch va en la CASILLA y no en el objeto', () => {
  // ⚠️ MEDIDO EN VIVO Y CARÍSIMO. Con `micro: MicroSchema.nullable().catch(null)`, una
  // casilla que el modelo omitiera hacía fallar el parse del objeto y `.catch` devolvía
  // null: se perdían las SEIS. En la sesión que lo destapó, `objetoEnMano` volvió 5/5 y
  // `micro` volvió null en los 5 cortes — el detalle atómico que el modelo SÍ produjo se
  // tiró en silencio.
  it('una casilla que falte no arrastra a las otras cinco', () => {
    const out = MicroSchema.parse({ cuerpo: 'torso quieto', manos: 'sube', rostro: 'sonríe', cabello: 'fijo' })
    expect(out.entorno).toBe('')
    expect(Object.values(out).filter(Boolean)).toHaveLength(4)
  })

  // ⚠️ LA INFALIBILIDAD ES LO QUE PERMITE QUE EL OBJETO SEA REQUERIDO SIN RIESGO. Si
  // alguien devuelve una casilla a `z.string()` a secas, el parse del objeto vuelve a poder
  // fallar y el `.catch` de afuera lo convierte en null — se pierden las seis otra vez.
  it('el objeto NO puede fallar: es lo que hace seguro el .catch de afuera', () => {
    expect(MicroSchema.safeParse({}).success).toBe(true)
    expect(ObjetoEnManoSchema.safeParse({}).success).toBe(true)
  })

  // Y la otra mitad: lo que no se le EXIGE al modelo, no lo manda. Medido — con los dos
  // objetos en `.optional()`, una corrida entera volvió con las claves ausentes: 0/5.
  it('los dos objetos van en el `required` del corte', () => {
    const req = (z.toJSONSchema(CorteSchema) as { required?: string[] }).required ?? []
    expect(req).toContain('micro')
    expect(req).toContain('objetoEnMano')
  })

  it('una sesión guardada sin ninguno de los dos sigue parseando', () => {
    const c = CorteSchema.parse({ n: 1, tiempo: 'a', duracionSeg: 1, accion: 'x', camara: 'y', dialogo: '', textoOverlay: '', transicion: '', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO })
    expect(c.micro).toBeNull()
    expect(c.objetoEnMano).toBeNull()
  })

  // ⚠️ LA SALIDA QUE EL SCHEMA LE OFRECÍA AL MODELO. `.nullable().catch(null)` emite
  // {"default": null, "anyOf": [{"type":"string"},{"type":"null"}]} — o sea le dice que
  // null es legal Y que es el default. Medido: con esa forma los objetos volvieron 6/6
  // pero las cuatro casillas nuevas salieron null en los 6 cortes. `.catch('')` deja el
  // campo en `required`, infalible, y SIN null donde escaparse.
  it('ninguna casilla le ofrece `null` como respuesta legal', () => {
    for (const esquema of [MicroSchema, ObjetoEnManoSchema]) {
      const props = (z.toJSONSchema(esquema) as { properties: Record<string, unknown> }).properties
      for (const [k, v] of Object.entries(props)) {
        expect(JSON.stringify(v), `${k} le ofrece null al modelo`).not.toContain('null')
      }
    }
  })

  it('las seis casillas se le siguen exigiendo al modelo', () => {
    const req = (z.toJSONSchema(MicroSchema) as { required?: string[] }).required ?? []
    for (const k of ['cuerpo', 'manos', 'rostro', 'cabello', 'entorno']) expect(req).toContain(k)
  })
})

describe('ObjetoEnManoSchema — por qué NO son .optional()', () => {
  // ⚠️ Un campo `.optional()` sale del `required` del JSON Schema, y lo que no se le exige
  // al modelo lo omite en silencio. Medido en la primera sesión analizada con el schema:
  // `izquierda` y `derecha` volvieron en 0 de 4 cortes, teniendo el dato en `accion`
  // ("Sujeta frasco con izquierda, saca gotero con derecha"). El eje entero quedaba en
  // no-op con el síntoma idéntico al bug que vino a arreglar.
  it('los tres campos van en el `required` que se le manda al modelo', () => {
    const req = (z.toJSONSchema(ObjetoEnManoSchema) as { required?: string[] }).required ?? []
    for (const k of ['inicio', 'fin', 'accesorios']) expect(req).toContain(k)
  })

  // Y la otra mitad: un `.nullable()` a secas reventaría el parse de toda sesión guardada.
  it('una sesión vieja sin los campos sigue parseando', () => {
    const out = ObjetoEnManoSchema.parse({ inicio: 'frasco', fin: 'frasco' })
    expect(out).toEqual({ inicio: 'frasco', fin: 'frasco', accesorios: '' })
  })
})

describe('reconciliarConVentana', () => {
  const corte = (n: number, tiempo: string, duracionSeg: number, dialogo = ''): Corte => ({
    n, tiempo, duracionSeg, accion: 'x', camara: 'y', dialogo,
    textoOverlay: 'No aparece', transicion: 'corte', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
  })
  const rep = (cortes: Corte[], total?: number): ForensicReport => ({
    duracionTotalSeg: total ?? cortes.reduce((n, c) => n + c.duracionSeg, 0),
    caracteresGuion: 0, guionOriginal: '', sujeto: '', vestuario: '', producto: '', fondo: '',
    elementosGraficos: '', cortes,
    tomas: cortes.map((c) => ({ n: c.n, encuadre: '', posicion: '', accionFisica: '', objeto: '', dialogo: c.dialogo, duracionSeg: c.duracionSeg })),
    edicion: { sincronizacion: '', textoOverlay: '', escalaZoom: '', cortes: '', ritmo: '', corteFinal: '' },
    resumenParaUsuario: '',
  })

  // ⚠️ EL CASO REAL: el anuncio de serum dedica ~8 s al frasco a pantalla completa; el
  // forense declaró la ventana 00:10-00:15 y una duración de 3,4 s. La ventana manda.
  it('levanta el corte mudo que el modelo subestimó', () => {
    const { report, ajustes } = reconciliarConVentana(rep([
      corte(1, '00:00 - 00:10', 10, 'hablando'),
      corte(2, '00:10 - 00:15', 3.4),
      corte(3, '00:15 - 00:20', 5, 'más'),
    ], 20))
    expect(report.cortes[1].duracionSeg).toBe(5)
    expect(ajustes).toEqual([{ n: 2, de: 3.4, a: 5 }])
    // `tomas` empareja 1-a-1 con `cortes` y tiene que seguirlas.
    expect(report.tomas[1].duracionSeg).toBe(5)
  })

  // Fail-closed: sin una línea de tiempo coherente no hay motivo para creerle a la ventana.
  it('no toca nada si las ventanas dejan un hueco', () => {
    const r = rep([corte(1, '00:00 - 00:05', 3), corte(2, '00:09 - 00:14', 3)])
    expect(reconciliarConVentana(r).report).toBe(r)
  })

  it('no toca nada si las ventanas se solapan', () => {
    const r = rep([corte(1, '00:00 - 00:10', 3), corte(2, '00:05 - 00:15', 3)])
    expect(reconciliarConVentana(r).report).toBe(r)
  })

  it('no toca nada si la suma no se parece a la duración total declarada', () => {
    const r = rep([corte(1, '00:00 - 00:05', 5), corte(2, '00:05 - 00:10', 5)], 40)
    expect(reconciliarConVentana(r).report).toBe(r)
  })

  it('no toca nada si alguna ventana es ilegible', () => {
    const r = rep([corte(1, 'inicio - fin', 5), corte(2, '00:05 - 00:10', 5)])
    expect(reconciliarConVentana(r).report).toBe(r)
  })

  // Un desacuerdo menor a 1 s es ruido de redondeo del formato MM:SS, no un error.
  it('tolera el desacuerdo de menos de un segundo', () => {
    const r = rep([corte(1, '00:00 - 00:05', 4.6), corte(2, '00:05 - 00:10', 5)], 9.6)
    expect(reconciliarConVentana(r).ajustes).toEqual([])
  })

  it('es idempotente', () => {
    const { report } = reconciliarConVentana(rep([
      corte(1, '00:00 - 00:10', 10, 'x'), corte(2, '00:10 - 00:15', 3.4),
    ], 15))
    expect(reconciliarConVentana(report).report).toBe(report)
  })
})

describe('reconciliar + reparar: el b-roll sobrevive a las dos pasadas', () => {
  const corte = (n: number, tiempo: string, duracionSeg: number, dialogo = ''): Corte => ({
    n, tiempo, duracionSeg, accion: 'x', camara: 'y', dialogo,
    textoOverlay: 'No aparece', transicion: 'corte', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
  })
  // El caso real del anuncio de serum: un beat de producto MUDO entre dos tomas habladas
  // cuyo diálogo no entra en su duración, o sea el reparto va a buscar de dónde sacar.
  const base = () => ({
    duracionTotalSeg: 20, caracteresGuion: 0, guionOriginal: '', sujeto: '', vestuario: '',
    producto: '', fondo: '', elementosGraficos: '',
    cortes: [
      corte(1, '00:00 - 00:10', 10, 'x'.repeat(240)),
      corte(2, '00:10 - 00:15', 3.4),
      corte(3, '00:15 - 00:20', 5, 'x'.repeat(120)),
    ],
    tomas: [1, 2, 3].map((n) => ({ n, encuadre: '', posicion: '', accionFisica: '', objeto: '', dialogo: '', duracionSeg: 1 })),
    edicion: { sincronizacion: '', textoOverlay: '', escalaZoom: '', cortes: '', ritmo: '', corteFinal: '' },
    resumenParaUsuario: '',
  }) as ForensicReport

  // ⚠️ SIN PISO VISIBLE, LA RECONCILIACIÓN NO SIRVE DE NADA: un corte mudo tiene mínimo de
  // habla 0, así que el reparto lo vacía para financiar a los hablados en la línea
  // siguiente a la que acaba de levantarlo.
  it('sin piso, el reparto vacía el beat mudo que se acaba de levantar', () => {
    const { report } = reconciliarConVentana(base())
    expect(report.cortes[1].duracionSeg).toBe(5)
    const sinPiso = repairCutTiming(report).report
    expect(sinPiso.cortes[1].duracionSeg).toBeLessThan(5)
  })

  it('con piso, el beat mudo conserva su duración real', () => {
    const { report } = reconciliarConVentana(base())
    const conPiso = repairCutTiming(report, MIN_TOMA_SEG).report
    // Su duración REAL son los 5 s de su ventana, no `MIN_TOMA_SEG`: el piso está acotado
    // a la duración que el corte ya tiene (es un suelo contra el vaciado, no un empujón
    // hacia arriba). Comparar contra la constante coincidía por casualidad mientras valía
    // 4, y rompía sola al atarla al piso de grok.
    expect(conPiso.cortes[1].duracionSeg).toBe(5)
    // Y el diálogo de los cortes hablados sigue siendo decible: el piso no rompe eso.
    for (const c of conPiso.cortes) {
      if (!c.dialogo) continue
      expect(c.dialogo.length / c.duracionSeg).toBeLessThanOrEqual(CPS_MAX + 0.01)
    }
  })
})

describe('buildForensicInstruction — la escala de encuadre vive donde se declara el campo', () => {
  const p = buildForensicInstruction()

  // ⚠️ Estaba como bloque FLOTANTE antes de la sección de cortes, y la definición del campo
  // decía "ver la escala de abajo" apuntando hacia arriba. Medido en la sesión siguiente:
  // el modelo siguió devolviendo la etiqueta ("Plano medio, frontal, fija") en vez del
  // punto de corte. La lección de esta tanda es que la instrucción tiene que vivir donde se
  // declara el campo — es lo que funcionó con `micro.manos`.
  it('la escala aparece DESPUÉS de nombrar el campo, no antes', () => {
    const campo = p.indexOf('`camara`, que se declara así')
    const escala = p.indexOf('EL ENCUADRE SE DECLARA POR DÓNDE CORTA')
    expect(campo).toBeGreaterThan(0)
    expect(escala).toBeGreaterThan(campo)
  })

  it('no quedan referencias colgantes a una escala que no está', () => {
    expect(p).not.toContain('ver la escala de abajo')
  })

  // ⚠️ LA ESCALA VA EN INGLÉS PORQUE `camara` VA EN INGLÉS. Medido: los ejemplos de un
  // campo le ganan a la regla global de idioma —es el patrón "un ejemplo con forma de
  // valor es una plantilla que rellenar"— así que un glosario en español devolvía
  // encuadres en español dentro de un prompt de render inglés.
  it('da la escala completa por punto de corte, en el idioma del campo', () => {
    for (const t of ['shoulders', 'chest', 'sternum', 'waist', 'thighs', 'whole body'])
      expect(p).toContain(t)
    expect(p).not.toContain('esternón')
  })
})

// ⚠️ EL CONTRATO DE IDIOMA (§35) MUEVE `accion` Y `micro` AL INGLÉS EN LAS SESIONES
// NUEVAS, y estos tres guards los parseaban en español. Cada uno falla en una dirección
// distinta, y por eso hacen falta los tres casos:
//
//   corteMuestraPersona  → falla ABIERTO: sin el centinela en inglés ninguna casilla
//                          parece ausente, TODO corte se lee como plano de persona y un
//                          flat-lay vuelve a fusionarse entre dos planos de la modelo.
//   muestraPersona       → falla CERRADO: sin los términos en inglés devuelve `false`
//                          para toda acción y apaga la frontera de clase de los lotes.
//   coreografiaEscasa    → miente: cuenta menos movimientos de los que hay, justo en el
//                          log que se usa para medir si la densidad mejoró.
describe('los guards deterministas sobreviven el cambio de idioma', () => {
  const corte = (over: Record<string, unknown>) => ({
    n: 1, tiempo: '00:00 - 00:05', duracionSeg: 5, accion: '', camara: '', dialogo: '',
    textoOverlay: 'No aparece', transicion: 'corte directo', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
    ...over,
  })
  const micro = (over: Record<string, string>) =>
    ({ cuerpo: '', manos: '', rostro: '', cabello: '', entorno: '', ...over })

  it('reconoce el marcador de ausencia en inglés (si no, un flat-lay pasa por persona)', () => {
    const flatLay = corte({
      accion: 'Close-up of the bottle on the counter, no person in frame.',
      micro: micro({ cuerpo: 'not visible', rostro: 'not visible', cabello: 'not visible', entorno: 'static background' }),
    })
    expect(corteMuestraPersona(flatLay as never)).toBe(false)
  })

  it('sigue reconociendo el marcador en español, para las sesiones guardadas', () => {
    const flatLay = corte({
      accion: 'Detalle del frasco, sin persona en cuadro.',
      micro: micro({ cuerpo: 'no aparece', rostro: 'no aparece', cabello: 'no aparece', entorno: 'fondo quieto' }),
    })
    expect(corteMuestraPersona(flatLay as never)).toBe(false)
  })

  // ⚠️ LA INVARIANTE DE ESTE CAMBIO ES LA PARIDAD, no el criterio. Qué casillas mira el
  // guard (`cuerpo`/`rostro`/`cabello`, nunca `manos`) es una decisión medida y aparte:
  // acá solo se exige que el MISMO contenido, escrito en los dos idiomas, dé el MISMO
  // veredicto. Si algún día se cambia el criterio, este test sigue valiendo.
  it('el mismo corte en los dos idiomas da el mismo veredicto', () => {
    const pares: [Record<string, string>, Record<string, string>][] = [
      // habla a cámara
      [micro({ cuerpo: 'slight sway, still torso', rostro: 'blinks, lips articulate', cabello: 'still on shoulders' }),
       micro({ cuerpo: 'ligero balanceo, torso quieto', rostro: 'parpadea, labios articulan', cabello: 'fijo sobre hombros' })],
      // flat-lay del producto
      [micro({ cuerpo: 'not visible', rostro: 'not visible', cabello: 'not visible', entorno: 'static background' }),
       micro({ cuerpo: 'no aparece', rostro: 'no aparece', cabello: 'no aparece', entorno: 'fondo quieto' })],
      // solo el rostro descrito: basta UNA de las tres
      [micro({ cuerpo: 'not visible', rostro: 'soft smile', cabello: 'not visible' }),
       micro({ cuerpo: 'no aparece', rostro: 'sonrisa suave', cabello: 'no aparece' })],
    ]
    for (const [en, es] of pares) {
      const a = corteMuestraPersona(corte({ accion: 'x', micro: en }) as never)
      const b = corteMuestraPersona(corte({ accion: 'x', micro: es }) as never)
      expect(a).toBe(b)
    }
  })

  it('muestraPersona (el camino legado) entiende las dos lenguas', () => {
    expect(muestraPersona('Woman holds the bottle and looks at the camera')).toBe(true)
    expect(muestraPersona('Product detail, no person in frame')).toBe(false)
    expect(muestraPersona('Mujer sostiene el frasco y mira a cámara')).toBe(true)
    expect(muestraPersona('Detalle del producto, sin persona en cuadro')).toBe(false)
  })

  it('coreografiaEscasa cuenta los movimientos con conectores en inglés', () => {
    const accion = 'takes the bottle with her right hand, then removes the dropper, '
      + 'after that applies a drop on her cheek and massages it in, next she looks at the camera'
    const informe = { cortes: [{ n: 1, duracionSeg: 10, accion }] } as never
    // 5 movimientos en 10 s = 0,5/s: justo el piso, así que NO debe reportarse como escasa.
    // Contando solo conectores españoles se parte mucho menos y aparecería un falso aviso.
    expect(coreografiaEscasa(informe)).toEqual([])
  })
})

describe('coreografiaEscasa', () => {
  const corte = (n: number, duracionSeg: number, accion: string): Corte => ({
    n, tiempo: '00:00 - 00:10', duracionSeg, accion, camara: '', dialogo: '',
    textoOverlay: '', transicion: '', objetoEnMano: null, micro: null, motion: TIMELINE_VACIO,
  })
  const rep = (cortes: Corte[]) => ({ cortes } as ForensicReport)

  // ⚠️ EL CASO MEDIDO: un corte de 10 s descrito con dos frases. El original tiene seis o
  // siete movimientos ahí, y el video generado se queda quieto el resto del tiempo.
  it('marca el corte largo descrito con dos frases', () => {
    const out = coreografiaEscasa(rep([corte(1, 10,
      'Sostiene gotero con mano derecha, lo lleva a la mejilla. Luego, muestra el frasco frente al pecho')]))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ n: 1, seg: 10 })
  })

  it('no marca el corte con un movimiento cada dos segundos', () => {
    expect(coreografiaEscasa(rep([corte(1, 6,
      'levanta la mano derecha, destapa el frasco, aplica en la mejilla, baja la mano')]))).toEqual([])
  })

  // Un corte corto no tiene margen para muchos movimientos: no se le exige.
  it('ignora los cortes de menos de 4 segundos', () => {
    expect(coreografiaEscasa(rep([corte(1, 2, 'mira a cámara')]))).toEqual([])
  })
})

// ⚠️ LOS TRAMOS EN PROSA ERAN UNA LISTA DE BEATS POBRE, Y POR ESO SE FUERON.
// Su historia: la cuenta de "un movimiento cada 2 segundos" no movía a los cortes largos
// (el modelo se topa en ~4 cláusulas por respuesta), así que se les dio una ESTRUCTURA en
// texto — "0-2 s: …; 2-4 s: …" — para convertir "describí más" en "describí cada tramo".
// Funcionaba a medias y seguía siendo prosa que alguien tenía que parsear aguas abajo.
// `motion` es esa misma estructura pero de verdad: campos, tiempos y estados que el código
// puede validar. Mantener las dos habría sido pedir el mismo contenido dos veces — el
// duplicado que este repo ya midió que vuelve vacío.
describe('buildForensicInstruction — la línea de tiempo del movimiento', () => {
  const p = buildForensicInstruction()

  it('pide una línea de tiempo de estados, no un resumen', () => {
    expect(p).toMatch(/Do not summarize choreography/)
    expect(p).toMatch(/ORDERED TIMELINE OF/)
    expect(p).toMatch(/motion.*LÍNEA DE TIEMPO DEL MOVIMIENTO/)
  })

  // El límite de un beat es un cambio de ESTADO VISIBLE. Que no sea el final de una frase
  // es la misma regla de corte real que rige todo el forense, un nivel más abajo.
  it('el beat abre por cambio de estado, nunca por fin de frase', () => {
    expect(p).toMatch(/NEW BEAT when one of these MATERIALLY changes/)
    expect(p).toMatch(/never because a sentence ends/)
  })

  // ⚠️ LA DENSIDAD LA PONE LA FUENTE. La cuota fija ("un movimiento cada 2 s") se eliminó:
  // servía contra los resúmenes vagos, pero como representación obliga a inventar
  // movimiento donde el original está quieto — y el render ejecuta lo que se le invente.
  it('la densidad sigue a la fuente y la quietud es una respuesta válida', () => {
    expect(p).toMatch(/DENSITY FOLLOWS THE SOURCE, not a quota/)
    expect(p).toMatch(/NEVER invent motion to reach a number/)
    expect(p).toMatch(/static speaking\s+interval is a valid, correct answer/)
    expect(p).not.toMatch(/un movimiento por cada 2 segundos/i)
  })

  it('separa las dos manos y dice por qué', () => {
    expect(p).toMatch(/THE TWO HANDS ARE TRACKED SEPARATELY/)
    expect(p).toMatch(/swaps the tasks between them/)
  })

  // El encadenado de estados es lo que `validateMotionTimeline` comprueba en código: si el
  // prompt no lo pide como máquina de estados, no hay nada que validar.
  it('pide el estado del producto como máquina de estados', () => {
    expect(p).toMatch(/STATE MACHINE, not a description/)
    expect(p).toMatch(/What a beat LEAVES is/)
    expect(p).toContain('not in frame')
  })

  it('pide el instante de referencia para poder anclar la pose', () => {
    expect(p).toMatch(/referenceFrameMs/)
    expect(p).toMatch(/frame that will/)
  })

  // `importance` es lo que la escalera de degradación necesita para no recortar a ciegas.
  it('etiqueta la importancia y dice para qué sirve', () => {
    expect(p).toMatch(/`importance`/)
    expect(p).toMatch(/sheds `micro` first and NEVER a `major`/)
  })

  // Se deja de pedir porque se DERIVA: preguntaba lo mismo que el estado del primer y del
  // último beat, en la misma granularidad.
  it('ya no pide objetoEnMano: se deriva del timeline', () => {
    expect(p).toMatch(/`objetoEnMano` YA NO SE PIDE/)
  })
})


// ⚠️ El defecto que contamina todo cuesta abajo, con los casos REALES de `7e4ccbcf`.
describe('verificarDialogos', () => {
  const rep = (cortes: { n: number; tiempo: string; dialogo: string }[], guion: string) =>
    ({ guionOriginal: guion, cortes } as never)

  it('caza la línea repetida en dos cortes', () => {
    const linea = 'Este es el serum antienvejecimiento de la marca Apivita y se llama Beevine Elixir.'
    const p = verificarDialogos(rep([
      { n: 2, tiempo: '00:04 - 00:10', dialogo: linea },
      { n: 3, tiempo: '00:10 - 00:15', dialogo: linea },
    ], `${linea} ${linea}`))
    expect(p.some((x) => x.corte === 3 && /repite el diálogo del corte 2/.test(x.motivo))).toBe(true)
  })

  // ⚠️ Contra la VENTANA y no contra la duración: `repairCutTiming` infla el corte para que
  // el texto entre, y ahí el defecto deja de verse en el análisis guardado.
  it('caza el diálogo que no cabe en su ventana', () => {
    const largo = 'x'.repeat(163)
    const p = verificarDialogos(rep([{ n: 1, tiempo: '00:00 - 00:04', dialogo: largo }], largo))
    expect(p.some((x) => x.corte === 1 && /40\.8 car\/s/.test(x.motivo))).toBe(true)
  })

  it('caza que la suma de los diálogos no reconstruya el guion', () => {
    const p = verificarDialogos(rep(
      [{ n: 1, tiempo: '00:00 - 00:10', dialogo: 'hola' }], 'hola que tal'))
    expect(p.some((x) => /no reconstruye el guion/.test(x.motivo))).toBe(true)
  })

  it('un reparto correcto no reporta nada', () => {
    const p = verificarDialogos(rep([
      { n: 1, tiempo: '00:00 - 00:04', dialogo: 'Este serum me cambió la piel.' },
      { n: 2, tiempo: '00:04 - 00:10', dialogo: 'Si tú también estás por los treinta.' },
    ], 'Este serum me cambió la piel. Si tú también estás por los treinta.'))
    expect(p).toEqual([])
  })
})

// ⚠️ LAS CUATRO REGLAS SALEN DE LOS 5 LOTES REALES DE `7e4ccbcf`: con la oración libre el
// patrón bueno salía 1 de cada 3, y cada test de acá es una de las frases que salieron mal.
describe('verificarAcciones — la plantilla de la oración', () => {
  const beat = (action: string, antes = 'bottle in left hand', despues = 'bottle in left hand') =>
    ({ startSec: 0, endSec: 2, referenceFrameMs: 0, action, productStateBefore: antes, productStateAfter: despues, importance: 'major' })
  const rep = (...acciones: ReturnType<typeof beat>[]) =>
    ({ cortes: [{ n: 1, motion: { beats: acciones } }] } as never)

  it('acepta la forma A — transferencia, con instrumento y subordinada al final', () => {
    expect(verificarAcciones(rep(beat(
      'She releases one drop of serum onto her left cheek with the dropper, while her left hand holds the bottle at chest level.',
      'dropper full, above cheek', 'serum on her left cheek',
    )))).toEqual([])
  })

  it('acepta la forma C — quietud declarada como cláusula principal', () => {
    expect(verificarAcciones(rep(beat(
      'She holds the bottle at chest level with both hands and looks at the camera.',
    )))).toEqual([])
  })

  // El lote 2 real devolvió exactamente esto.
  it('caza el fragmento sin sujeto ni verbo', () => {
    const p = verificarAcciones(rep(beat('bottle rotation')))
    expect(p[0].motivo).toMatch(/no arranca con el sujeto/)
  })

  // El lote 1 shot 1 real: la acción enterrada detrás de un verbo de habla.
  it('caza el verbo que no está en la lista cerrada', () => {
    const p = verificarAcciones(rep(beat(
      'She speaks to the camera while holding the open dropper near her cheek with her right hand.',
    )))
    expect(p[0].motivo).toMatch(/no está en la lista cerrada/)
  })

  // El lote 4 real: 9,8 segundos con un verbo que no avanza mientras el producto sí se mueve.
  it('caza el verbo quieto cuando el producto cambia de estado', () => {
    const p = verificarAcciones(rep(beat(
      'She holds the bottle up near her chin with her right hand, while her left hand rests at her side.',
      'bottle at chest level', 'bottle near her chin',
    )))
    expect(p.some((x) => /no avanza/.test(x.motivo))).toBe(true)
  })

  it('caza la coletilla de habla', () => {
    const p = verificarAcciones(rep(beat(
      'She raises the bottle to her chin with her right hand and talking, while her left hand rests.',
      'bottle at chest', 'bottle at chin',
    )))
    expect(p.some((x) => /coletilla de habla/.test(x.motivo))).toBe(true)
  })

  // El modo de fallo SILENCIOSO que tenía el pase general: pedía cuatro campos borrados del
  // schema, así que `action` volvía vacía y el lote caía a la prosa sin que nada lo dijera.
  it('caza el beat sin oración', () => {
    expect(verificarAcciones(rep(beat('')))[0].motivo).toMatch(/sin oración/)
  })

  // ⚠️ LOS TRES VERBOS QUE LA PRIMERA CORRIDA REAL DEVOLVIÓ Y LA LISTA NO TENÍA. El modelo
  // los eligió bien —la forma de la oración era correcta en las tres— y la lista estaba
  // corta: se amplía acá, que es el mecanismo previsto. Si alguna se cae, la lista se
  // recortó de más.
  it.each([
    'She gestures towards her left cheek with her right hand, while her left hand holds the serum bottle at chest level.',
    'She presents the serum bottle to the camera with both hands, while her left hand grips the upper bottle part.',
    'She rotates the serum bottle with both hands, while her left hand supports the bottle base.',
  ])('acepta el verbo que la primera corrida real trajo: %s', (frase) => {
    expect(verificarAcciones(rep(beat(frase)))).toEqual([])
  })

  // `points to` tiene que ganarle a un prefijo más corto, si algún día se agrega uno.
  it('resuelve los verbos de varias palabras', () => {
    expect(verificarAcciones(rep(beat(
      'She points to her left cheek with her index finger, while her right hand holds the bottle.',
    )))).toEqual([])
  })
})

// ⚠️ LA PLANTILLA VIVE EN UNA SOLA CONSTANTE Y LOS DOS PROMPTS LA EMITEN. El pase general
// declaraba `action` pidiendo cuatro campos que ya no existen en el schema: cuando el
// refinamiento falla, ese pase es el único que escribe la coreografía.
describe('la plantilla de acción está en los DOS prompts', () => {
  for (const [nombre, prompt] of [
    ['pase general', buildForensicInstruction()],
    ['pase de refinamiento', buildMotionRefinementInstruction([{ n: 1, tiempo: '00:00 - 00:05', duracionSeg: 5 } as never])],
  ] as const) {
    it(`${nombre}: trae las tres formas y la lista cerrada`, () => {
      expect(prompt).toContain('A · TRANSFER')
      expect(prompt).toContain('C · DECLARED STILLNESS')
      for (const v of [...VERBOS_ACCION.transferencia, ...VERBOS_ACCION.quietos]) expect(prompt).toContain(v)
    })
    it(`${nombre}: ya no pide los cuatro campos borrados del schema`, () => {
      expect(prompt).not.toContain('`headAndGaze`')
      expect(prompt).not.toContain('`leftHand` · `rightHand`')
    })
  }
})
