import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildForensicInstruction, ForensicReportSchema, repairCutTiming, mergeMicroCortes, muestraPersona, corteMuestraPersona, CPS_MAX, type ForensicReport, type Corte, enProsa, limpiarDialogo, verificarHablantes, unirTomasContinuas, ObjetoEnManoSchema } from './forensic'

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
    accion: 'a', camara: 'c', textoOverlay: 'No aparece', transicion: 'corte directo', micro: null,
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
        transicion: 'corte directo', micro: null,
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
    duracionSeg: dur, accion: `accion ${n}`, camara, dialogo, textoOverlay: 'No aparece', transicion: 'corte directo', micro: null,
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
    textoOverlay: 'No aparece', transicion: 'corte', micro: null,
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
    textoOverlay: 'No aparece', transicion: 'corte', micro: null,
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
    textoOverlay: 'No aparece', transicion: 'corte', micro: null,
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
    textoOverlay: 'No aparece', transicion: 'corte', micro: null, ...over,
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
  const micro = { cuerpo: 'quieto', manos: 'sube', rostro: 'sonríe', cabello: 'fijo', entorno: 'nada', posicion: 'centrada en el cuadro' }
  const corte = (n: number, p: Partial<Corte> = {}): Corte => ({
    n, tiempo: `00:0${n - 1} - 00:0${n}`, duracionSeg: 3,
    accion: 'La mujer sostiene el frasco', camara: 'Primer plano', dialogo: `linea ${n}`,
    textoOverlay: 'No aparece', transicion: 'corte directo',
    objetoEnMano: { inicio: 'frasco', fin: 'frasco', izquierda: null, derecha: null, accesorios: null }, micro,
    ...p,
  })
  const base = (cortes: Corte[]): ForensicReport => ({
    duracionTotalSeg: cortes.reduce((n, c) => n + c.duracionSeg, 0),
    caracteresGuion: 0, guionOriginal: '', sujeto: '', vestuario: '', producto: '', fondo: '',
    elementosGraficos: '', cortes,
    tomas: cortes.map((c) => ({ n: c.n, encuadre: '', posicion: '', accionFisica: '', objeto: '', dialogo: c.dialogo, duracionSeg: c.duracionSeg })),
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
    const a = corte(1, { objetoEnMano: { inicio: 'nada', fin: 'gotero', izquierda: null, derecha: null, accesorios: null } })
    const b = corte(2, { objetoEnMano: { inicio: 'nada', fin: 'nada', izquierda: null, derecha: null, accesorios: null } })
    expect(unirTomasContinuas(base([a, b]), 15, 300).report.cortes).toHaveLength(2)
  })

  it('tolera el artículo y las mayúsculas al comparar el objeto', () => {
    const a = corte(1, { objetoEnMano: { inicio: 'nada', fin: 'El frasco', izquierda: null, derecha: null, accesorios: null } })
    const b = corte(2, { objetoEnMano: { inicio: 'frasco', fin: 'frasco', izquierda: null, derecha: null, accesorios: null } })
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
      micro: { cuerpo: 'no aparece', manos: 'sostienen el frasco', rostro: 'no aparece', cabello: 'no aparece', entorno: 'fondo quieto', posicion: 'centrada en el cuadro' },
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
    const a = corte(1, { objetoEnMano: { inicio: 'nada', fin: 'frasco', izquierda: null, derecha: null, accesorios: null } })
    const b = corte(2, { objetoEnMano: { inicio: 'frasco', fin: 'frasco abierto', izquierda: null, derecha: null, accesorios: null } })
    const { report } = unirTomasContinuas(base([a, b]), 15, 300)
    expect(report.cortes[0].objetoEnMano).toEqual({ inicio: 'nada', fin: 'frasco abierto', izquierda: null, derecha: null, accesorios: null })
  })
})

describe('corteMuestraPersona', () => {
  const sin = { cuerpo: 'no aparece', manos: 'sostienen el frasco', rostro: 'no aparece', cabello: 'no aparece', entorno: 'fondo quieto', posicion: 'centrada en el cuadro' }
  const con = { cuerpo: 'torso erguido', manos: 'sube la mano', rostro: 'sonríe', cabello: 'fijo', entorno: 'quieto', posicion: 'centrada en el cuadro' }

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

describe('ObjetoEnManoSchema — por qué NO son .optional()', () => {
  // ⚠️ Un campo `.optional()` sale del `required` del JSON Schema, y lo que no se le exige
  // al modelo lo omite en silencio. Medido en la primera sesión analizada con el schema:
  // `izquierda` y `derecha` volvieron en 0 de 4 cortes, teniendo el dato en `accion`
  // ("Sujeta frasco con izquierda, saca gotero con derecha"). El eje entero quedaba en
  // no-op con el síntoma idéntico al bug que vino a arreglar.
  it('los tres campos van en el `required` que se le manda al modelo', () => {
    const req = (z.toJSONSchema(ObjetoEnManoSchema) as { required?: string[] }).required ?? []
    for (const k of ['inicio', 'fin', 'izquierda', 'derecha', 'accesorios']) expect(req).toContain(k)
  })

  // Y la otra mitad: un `.nullable()` a secas reventaría el parse de toda sesión guardada.
  it('una sesión vieja sin los campos sigue parseando', () => {
    const out = ObjetoEnManoSchema.parse({ inicio: 'frasco', fin: 'frasco' })
    expect(out).toEqual({ inicio: 'frasco', fin: 'frasco', izquierda: null, derecha: null, accesorios: null })
  })
})
