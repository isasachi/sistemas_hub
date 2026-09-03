import { describe, it, expect } from 'vitest'
import { normalizeMotionTimeline, validateMotionTimeline, objetoEnManoFromMotion, compileAccion, tieneMotion, TIMELINE_VACIO, ESTADO_VACIO, MotionTimelineSchema, type MotionBeat , repartirBeats } from './motion'

const beat = (over: Partial<MotionBeat> = {}): MotionBeat => ({
  startSec: 0, endSec: 1, referenceFrameMs: 500,
  body: '', headAndGaze: '', leftHand: '', rightHand: '',
  productStateBefore: '', productStateAfter: '', importance: 'major', ...over,
})
const tl = (beats: MotionBeat[]) => ({ ...TIMELINE_VACIO, beats })

describe('el schema no le ofrece al modelo una salida', () => {
  // ⚠️ ESTA ES LA LECCIÓN MÁS CARA DEL MILESTONE, y está MEDIDA: con
  // `.nullable().catch(null)` el modelo devolvió **0 de 5 cortes con timeline**. El schema
  // emite `{"default": null}`, o sea le dice que null es válido Y que es lo esperado.
  // Con `.catch(TIMELINE_VACIO)` la misma llamada devolvió 5 de 5.
  it('un timeline ausente parsea a vacío, nunca a null', () => {
    const r = MotionTimelineSchema.catch(() => TIMELINE_VACIO).parse(undefined)
    expect(r).toEqual(TIMELINE_VACIO)
    expect(r).not.toBeNull()
  })

  // El JSON Schema que ve el modelo no puede contener `null` como opción para este campo.
  it('el JSON Schema no declara null como valor válido', () => {
    const js = JSON.stringify(require('zod').toJSONSchema(MotionTimelineSchema))
    expect(js).not.toContain('"null"')
  })

  // ⚠️ Un beat malformado no puede llevarse el timeline entero: es la trampa que este repo
  // ya pagó con `micro` (el `.catch` del objeto convierte una casilla omitida en la pérdida
  // de todas). Cada pieza aguanta sola.
  it('una pieza rota no destruye lo que el modelo sí produjo', () => {
    const r = MotionTimelineSchema.catch(() => TIMELINE_VACIO)
      .parse({ startState: 'basura', beats: [beat({ body: 'sways' })], endState: null })
    expect(r.beats).toHaveLength(1)
    expect(r.beats[0].body).toBe('sways')
    expect(r.startState).toEqual(ESTADO_VACIO)
  })

  it('"tiene movimiento" pregunta por el contenido, no por la presencia', () => {
    expect(tieneMotion({ motion: TIMELINE_VACIO })).toBe(false)
    expect(tieneMotion({ motion: tl([beat()]) })).toBe(true)
  })
})

describe('normalizeMotionTimeline', () => {
  // ⚠️ EL CORTE ES LA AUTORIDAD DE TIEMPO. Misma regla por la que `repairCutTiming` nunca
  // toca `tiempo`: si un beat mal medido pudiera correr la ventana, todo lo que empareja
  // por esa marca se desincroniza en silencio.
  it('acota los beats a la duración del corte, nunca al revés', () => {
    const r = normalizeMotionTimeline(tl([beat({ startSec: -3, endSec: 99 })]), 5)
    expect(r.beats[0].startSec).toBe(0)
    expect(r.beats[0].endSec).toBe(5)
  })

  it('un beat nunca empieza antes de donde terminó el anterior', () => {
    const r = normalizeMotionTimeline(tl([beat({ startSec: 0, endSec: 3 }), beat({ startSec: 1, endSec: 4 })]), 10)
    expect(r.beats[1].startSec).toBeGreaterThanOrEqual(r.beats[0].endSec)
  })

  // ⚠️ Sin idempotencia, dos pasadas darían dos huellas de reanudación distintas para el
  // mismo contenido — el mismo motivo por el que `repairCutTiming` la garantiza.
  it('es idempotente', () => {
    const uno = normalizeMotionTimeline(tl([beat({ startSec: -1, endSec: 9 }), beat({ startSec: 2, endSec: 4 })]), 6)
    expect(normalizeMotionTimeline(uno, 6)).toEqual(uno)
  })

  // Los contadores los calcula el CÓDIGO: un LLM es mal aritmético y el número decide
  // después cuánta carga de movimiento entra en un clip.
  it('deriva los contadores en vez de creerle al modelo', () => {
    const r = normalizeMotionTimeline({
      ...tl([beat({ importance: 'major', productStateBefore: 'on table', productStateAfter: 'in hand' }),
             beat({ importance: 'micro', productStateBefore: 'in hand', productStateAfter: 'in hand' })]),
      majorBeatCount: 99, productStateTransitionCount: 99, majorBeatsPerSecond: 99,
    }, 4)
    expect(r.majorBeatCount).toBe(1)
    expect(r.productStateTransitionCount).toBe(1)
    expect(r.majorBeatsPerSecond).toBe(0.25)
  })
})

describe('validateMotionTimeline', () => {
  it('acepta una cadena que encadena', () => {
    expect(validateMotionTimeline(tl([
      beat({ productStateBefore: 'bottle on table', productStateAfter: 'bottle in right hand' }),
      beat({ productStateBefore: 'bottle in right hand', productStateAfter: 'label facing camera' }),
    ]))).toEqual([])
  })

  // ⚠️ FALSO POSITIVO MEDIDO sobre un video real: un beat dejaba "Dropper held in front of
  // face" y el siguiente esperaba "Dropper in front of face" — el mismo estado con una
  // palabra de más. Un validador que marca eso entrena a ignorarlo.
  it('tolera la misma cosa dicha con más o menos palabras', () => {
    expect(validateMotionTimeline(tl([
      beat({ productStateAfter: 'Dropper held in front of face' }),
      beat({ productStateBefore: 'Dropper in front of face' }),
    ]))).toEqual([])
  })

  it('sigue cazando una contradicción real', () => {
    const issues = validateMotionTimeline(tl([
      beat({ productStateAfter: 'bottle on the table' }),
      beat({ productStateBefore: 'bottle at her face' }),
    ]))
    expect(issues).toHaveLength(1)
    expect(issues[0].beat).toBe('b2')
  })

  // Reporta, no repara: inventar la transición que falta sería fabricar movimiento que no
  // está en la referencia, que es justo lo que este eje existe para impedir.
  it('no repara: solo devuelve el problema', () => {
    const roto = tl([beat({ productStateAfter: 'A' }), beat({ productStateBefore: 'B' })])
    const copia = JSON.parse(JSON.stringify(roto))
    validateMotionTimeline(roto)
    expect(roto).toEqual(copia)
  })
})

describe('lo que se DERIVA en vez de pedirse', () => {
  // `objetoEnMano` preguntaba lo mismo que el primer/último estado del producto, en la
  // misma granularidad — el duplicado que este repo ya midió que vuelve vacío.
  it('objetoEnMano sale del primer y último estado del producto', () => {
    const d = objetoEnManoFromMotion(tl([
      beat({ productStateBefore: 'bottle on table', productStateAfter: 'bottle in hand' }),
      beat({ productStateBefore: 'bottle in hand', productStateAfter: 'cap off, bottle in hand' }),
    ]))
    expect(d).toEqual({
      inicio: 'bottle on table',
      fin: 'cap off, bottle in hand',
      accesorios: 'bottle on table → bottle in hand → cap off, bottle in hand',
    })
  })

  // La cadena es lo único que muestra un estado que SALE Y VUELVE — comparar el primero
  // con el último no lo ve, y ése era el fallo de la tapa que reaparece.
  it('la cadena conserva un estado que vuelve', () => {
    const d = objetoEnManoFromMotion(tl([
      beat({ productStateBefore: 'cap on', productStateAfter: 'cap off' }),
      beat({ productStateBefore: 'cap off', productStateAfter: 'cap on' }),
    ]))
    expect(d?.accesorios).toBe('cap on → cap off → cap on')
    expect(d?.inicio).toBe('cap on')
    expect(d?.fin).toBe('cap on')
  })

  it('sin beats no hay nada que derivar', () => {
    expect(objetoEnManoFromMotion(TIMELINE_VACIO)).toBeNull()
  })

  // `accionVisual` deja de ser la FUENTE del movimiento y pasa a ser una proyección: si el
  // timeline cambia, la prosa cambia con él y no pueden contradecirse.
  it('compila la acción desde los beats, con el separador que el reparto ya sabe partir', () => {
    const a = compileAccion(tl([
      beat({ body: 'leans in', leftHand: 'holds bottle', rightHand: 'uncaps' }),
      beat({ body: 'straightens', rightHand: 'applies to cheek' }),
      beat({ importance: 'micro', body: 'blinks' }),
    ]))
    expect(a).toBe('leans in; left: holds bottle; right: uncaps Luego, straightens; right: applies to cheek')
    expect(a).not.toContain('blinks')
  })
})

// El caso medido de `repartirAccion` (duraciones 9:1), acá: sin el piso el segundo
// fragmento queda sin beats y cae a la prosa, que describe los tres — o sea repite lo que
// el candado del primero ya pidió.
describe('repartirBeats — piso de un beat por fragmento', () => {
  const b = (i: number) => ({
    startSec: i, endSec: i + 1, referenceFrameMs: 0, body: `b${i}`, headAndGaze: '',
    leftHand: '', rightHand: '', productStateBefore: '', productStateAfter: '',
    importance: 'major' as const,
  })
  it('le presta el beat vecino al fragmento que quedó vacío', () => {
    const [uno, dos] = repartirBeats([b(0), b(1), b(2)], [9, 1])
    expect(uno.map((x) => x.body)).toEqual(['b0', 'b1'])
    expect(dos.map((x) => x.body)).toEqual(['b2'])
    expect(dos[0].endSec).toBe(1)
  })
  it('no presta cuando el donante se quedaría sin ninguno', () => {
    const [uno, dos] = repartirBeats([b(0)], [9, 1])
    expect(uno).toHaveLength(1)
    expect(dos).toHaveLength(0)
  })
})

// Un beat cae en el fragmento que contiene su punto medio, así que puede desbordar sus
// bordes. Sin clamp se emite "[6.5–13.2s]" en un clip de 11,6 s.
it('repartirBeats clampea cada beat a la ventana de su fragmento', () => {
  const b = (s: number, e: number): MotionBeat => ({
    startSec: s, endSec: e, referenceFrameMs: 0, body: `${s}`, headAndGaze: '',
    leftHand: '', rightHand: '', productStateBefore: '', productStateAfter: '', importance: 'major',
  })
  const [uno, dos] = repartirBeats([b(0, 6.5), b(6.5, 13.2), b(13.2, 19.5)], [11.6, 7.9])
  for (const [i, frag] of [uno, dos].entries()) {
    const dur = [11.6, 7.9][i]
    for (const x of frag) {
      expect(x.startSec).toBeGreaterThanOrEqual(0)
      expect(x.endSec).toBeLessThanOrEqual(dur)
    }
  }
  expect(uno.at(-1)!.endSec).toBe(11.6)
})
