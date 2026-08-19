import { describe, it, expect } from 'vitest'
import { buildForensicInstruction, ForensicReportSchema, repairCutTiming, mergeMicroCortes, muestraPersona, CPS_MAX, type ForensicReport, enProsa } from './forensic'

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
    expect(p).toContain('"muestra el producto" es inservible')
  })

  it('pide español para lo que ve el usuario', () => {
    expect(p).toMatch(/español/i)
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
    accion: 'a', camara: 'c', textoOverlay: 'No aparece', transicion: 'corte directo',
  })
  const informe = (cortes: ReturnType<typeof corte>[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((n, c) => n + c.duracionSeg, 0),
    caracteresGuion: cortes.reduce((n, c) => n + c.dialogo.length, 0),
    guionOriginal: cortes.map((c) => c.dialogo).join(' '),
    sujeto: '', vestuario: '', producto: '', fondo: '', elementosGraficos: '',
    cortes,
    tomas: cortes.map((c) => ({
      n: c.n, encuadre: '', posicion: '', accionFisica: '', objeto: '',
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
        transicion: 'corte directo',
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
    duracionSeg: dur, accion: `accion ${n}`, camara, dialogo, textoOverlay: 'No aparece', transicion: 'corte directo',
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
    textoOverlay: 'No aparece', transicion: 'corte',
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
    textoOverlay: 'No aparece', transicion: 'corte',
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
    textoOverlay: 'No aparece', transicion: 'corte',
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
