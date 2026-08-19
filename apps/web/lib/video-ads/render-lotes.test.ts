import { describe, it, expect } from 'vitest'
import { totalDuration, resumeSeed, mergeRescue, isPaidResume, scriptFingerprint, renderDone } from './render-lotes'
import type { Lote } from './lotes'

const lote = (n: number, over: Partial<Lote> = {}): Lote => ({
  n,
  tomas: [{ n, duracionSeg: 5, accionVisual: 'a', personaje: 'p', producto: 'x', locucion: 'l', tiempoOriginal: '00:00' }],
  duracionSeg: 5,
  prompt: '',
  taskId: null,
  status: 'idle',
  videoUrl: null,
  failMsg: null,
  scriptHash: null,
  ...over,
} as Lote)

const VOZ = {
  idioma: 'es', varianteRegional: 'PE', acento: 'peruano', pronunciacion: 'clara',
  ritmo: 'medio', velocidad: 'media', entonacion: 'natural', energia: 'media',
  pausas: 'breves', tono: 'cálido', timbre: 'medio', edadVocal: '25-30', estilo: 'cercano',
}

const fpInput = (over: Partial<Parameters<typeof scriptFingerprint>[0]> = {}) => ({
  lotes: [lote(1), lote(2)],
  consistencyBlock: 'Mujer de 25, cabello negro',
  productDesc: 'Frasco celeste',
  escenario: 'cocina',
  camaras: ['primer plano', 'plano medio'],
  voz: VOZ,
  images: [{ url: 'https://x/p.png', role: 'la persona' }, { url: 'https://x/prod.png', role: 'el producto' }],
  ...over,
})

describe('totalDuration', () => {
  it('suma duracionSeg de todos los lotes, mezclando reales y placeholders', () => {
    const lotes = [lote(1, { duracionSeg: 8, taskId: 't1', status: 'waiting' }), lote(2, { duracionSeg: 6 })]
    expect(totalDuration(lotes)).toBe(14)
  })

  it('array vacío suma 0', () => {
    expect(totalDuration([])).toBe(0)
  })
})

describe('renderDone', () => {
  // El caso que motivó el fix (dashboard fix round 5): `video_url` se estampa con el
  // PRIMER lote listo, no cuando TODOS terminan — `renderDone` es la fórmula real que
  // el dashboard debería reflejar en vez de `!!video_url`.
  it('false si algún lote sigue vivo (sin videoUrl y sin fail), aunque otro ya tenga video', () => {
    const lotes = [
      lote(1, { videoUrl: 'https://x/1.mp4', status: 'success' }),
      lote(2, { taskId: 't2', status: 'generating' }),
    ]
    expect(renderDone(lotes)).toBe(false)
  })

  it('true cuando TODOS los lotes tienen video o fallaron explícitamente', () => {
    const lotes = [
      lote(1, { videoUrl: 'https://x/1.mp4', status: 'success' }),
      lote(2, { status: 'fail', failMsg: 'error de KIE' }),
    ]
    expect(renderDone(lotes)).toBe(true)
  })

  it('false si un lote quedó a medias (idle, sin taskId ni video)', () => {
    const lotes = [lote(1, { videoUrl: 'https://x/1.mp4', status: 'success' }), lote(2)]
    expect(renderDone(lotes)).toBe(false)
  })

  it('array vacío: true (vacuously, sin lotes no hay nada pendiente)', () => {
    expect(renderDone([])).toBe(true)
  })
})

describe('resumeSeed', () => {
  it('conserva el lote existente si ya tiene taskId (no lo recrea)', () => {
    const base = [lote(1), lote(2), lote(3)]
    const existentes = [lote(1, { taskId: 't1', status: 'waiting', prompt: 'ya armado' }), lote(2), lote(3)]
    const seed = resumeSeed(base, existentes)
    expect(seed[0]).toBe(existentes[0])
    expect(seed[0].taskId).toBe('t1')
  })

  it('usa el lote fresco de `base` si el existente no tiene taskId (nunca arrancó)', () => {
    const base = [lote(1, { prompt: 'fresco' }), lote(2)]
    const existentes = [lote(1, { prompt: 'viejo, sin taskId' }), lote(2)]
    const seed = resumeSeed(base, existentes)
    expect(seed[0].prompt).toBe('fresco')
  })

  it('sin lotes existentes, todo sale de base tal cual (primer render)', () => {
    const base = [lote(1), lote(2)]
    expect(resumeSeed(base, [])).toEqual(base)
  })

  it('un base más largo que los existentes usa el fresco para el índice que falta', () => {
    const base = [lote(1), lote(2), lote(3)]
    const existentes = [lote(1, { taskId: 't1' })]
    const seed = resumeSeed(base, existentes)
    expect(seed[0].taskId).toBe('t1')
    expect(seed[1]).toBe(base[1])
    expect(seed[2]).toBe(base[2])
  })
})

describe('mergeRescue', () => {
  // El caso que motivó el fix: sin esto, un array de largo 1 (solo lo completado)
  // hacía que `lote-status` calculara `done: true` con dos tercios del video sin
  // renderizar.
  it('fallo total (0 completados): el array de rescate son los placeholders completos de `seed`', () => {
    const seed = [lote(1), lote(2), lote(3)]
    const rescate = mergeRescue(seed, [])
    expect(rescate).toHaveLength(3)
    expect(rescate.every((l) => l.taskId === null && l.status === 'idle')).toBe(true)
  })

  it('fallo parcial (lote 1 completado, 2 y 3 quedan pendientes): conserva el taskId pagado', () => {
    const seed = [lote(1), lote(2), lote(3)]
    const completados = [lote(1, { taskId: 't1', status: 'waiting', prompt: 'p1' })]
    const rescate = mergeRescue(seed, completados)
    expect(rescate).toHaveLength(3)
    expect(rescate[0].taskId).toBe('t1')
    expect(rescate[1].taskId).toBeNull()
    expect(rescate[1].status).toBe('idle')
    expect(rescate[2].taskId).toBeNull()
  })

  it('todos completados: el resultado es exactamente `completados`, sin placeholders de más', () => {
    const seed = [lote(1), lote(2)]
    const completados = [lote(1, { taskId: 't1' }), lote(2, { taskId: 't2' })]
    expect(mergeRescue(seed, completados)).toEqual(completados)
  })
})

describe('scriptFingerprint', () => {
  it('es determinista: los mismos datos dan la misma huella', () => {
    expect(scriptFingerprint(fpInput())).toBe(scriptFingerprint(fpInput()))
  })

  // El caso que motivó el fix round 4: MISMA cantidad de lotes, contenido distinto.
  it('cambia si cambia el texto de una toma, aunque la cantidad de lotes sea la misma', () => {
    const otro = [lote(1, { tomas: [{ n: 1, duracionSeg: 5, accionVisual: 'a', personaje: 'p', producto: 'x', locucion: 'OTRA línea', tiempoOriginal: '00:00' }] }), lote(2)]
    expect(scriptFingerprint(fpInput({ lotes: otro }))).not.toBe(scriptFingerprint(fpInput()))
  })

  it('cambia si cambia la duración de una toma', () => {
    const otro = [lote(1, { duracionSeg: 6 }), lote(2)]
    expect(scriptFingerprint(fpInput({ lotes: otro }))).not.toBe(scriptFingerprint(fpInput()))
  })

  // Ensanchamiento deliberado: rehacer la FASE 4/4.5 cambia la PERSONA y la VOZ, así
  // que reanudar a través de ese cambio pegaría dos personajes distintos en un video.
  it('cambia si cambia el personaje, la voz o la imagen de referencia', () => {
    const original = scriptFingerprint(fpInput())
    expect(scriptFingerprint(fpInput({ consistencyBlock: 'Hombre de 40' }))).not.toBe(original)
    expect(scriptFingerprint(fpInput({ voz: { ...VOZ, acento: 'mexicano' } }))).not.toBe(original)
    expect(scriptFingerprint(fpInput({
      images: [{ url: 'https://x/OTRA.png', role: 'la persona' }, { url: 'https://x/prod.png', role: 'el producto' }],
    }))).not.toBe(original)
    expect(scriptFingerprint(fpInput({ escenario: 'playa' }))).not.toBe(original)
    expect(scriptFingerprint(fpInput({ camaras: ['plano general', 'plano medio'] }))).not.toBe(original)
    expect(scriptFingerprint(fpInput({ productDesc: 'Otro frasco' }))).not.toBe(original)
  })

  // La cámara pasó de un string único a una por lote: si el reparto de planos entre
  // lotes cambia, el video que sale es otro aunque las tomas sean las mismas. Los dos
  // arrays traen los mismos dos planos y solo difieren en cuál va en cada lote.
  it('distingue el mismo par de planos repartido al revés entre los lotes', () => {
    expect(scriptFingerprint(fpInput({ camaras: ['plano medio', 'primer plano'] })))
      .not.toBe(scriptFingerprint(fpInput({ camaras: ['primer plano', 'plano medio'] })))
  })

  // Si el estado mutable entrara en la huella, la segunda llamada NUNCA podría
  // coincidir con la guardada (el lote pagado ya tiene taskId, prompt y status).
  it('NO cambia por el estado mutable del lote (prompt, taskId, status, videoUrl, failMsg, scriptHash)', () => {
    const mutado = [
      lote(1, { prompt: 'ya armado', taskId: 't1', status: 'success', videoUrl: 'https://x/1.mp4', failMsg: 'x', scriptHash: 'viejo' }),
      lote(2),
    ]
    expect(scriptFingerprint(fpInput({ lotes: mutado }))).toBe(scriptFingerprint(fpInput()))
  })

  // El requisito explícito: la huella se guarda en un jsonb y se compara al reanudar.
  // Un falso negativo acá haría que ninguna reanudación legítima funcionara nunca.
  it('sobrevive el ida y vuelta por jsonb, incluido el reordenamiento de claves', () => {
    const original = scriptFingerprint(fpInput())
    const roundTrip = JSON.parse(JSON.stringify(fpInput().lotes)) as Lote[]
    expect(scriptFingerprint(fpInput({ lotes: roundTrip }))).toBe(original)

    // Postgres reordena las claves de un jsonb: se simula reconstruyendo cada objeto
    // con las claves en orden inverso. `scriptFingerprint` extrae campo por campo, así
    // que el orden no puede afectarla (con `JSON.stringify(obj)` sí lo haría).
    const reordenados = roundTrip.map((l) => Object.fromEntries(Object.entries(l).reverse()) as Lote)
    expect(scriptFingerprint(fpInput({ lotes: reordenados }))).toBe(original)
  })

  it('no cambia por ruido de punto flotante bajo la milésima', () => {
    const ruidoso = [lote(1, { duracionSeg: 5 + 1e-12 }), lote(2)]
    expect(scriptFingerprint(fpInput({ lotes: ruidoso }))).toBe(scriptFingerprint(fpInput()))
  })
})

describe('isPaidResume', () => {
  const H = scriptFingerprint(fpInput())
  const pagado = (n: number) => lote(n, { taskId: `t${n}`, status: 'waiting', scriptHash: H })
  const pendiente = (n: number) => lote(n, { scriptHash: H })

  // El caso central del fix round 2: la cuota ahora se cobra por VIDEO, no por lote,
  // y reanudar no debe volver a cobrar — pero SOLO si hay algo real que reanudar y el
  // contenido guardado es el mismo que se va a renderizar ahora.
  it('resume:true con un taskId pagado y la huella intacta es una reanudación real', () => {
    expect(isPaidResume(true, [pagado(1), pendiente(2)], [lote(1), lote(2)], H)).toBe(true)
  })

  it('resume:true SIN ningún taskId pagado NO es una reanudación real (nada que reanudar)', () => {
    // El disparador que motivó esta función: la primera llamada falló armando el
    // prompt del lote 1 y nunca llegó a tocar KIE (0 gastado). Un cliente que mande
    // `resume: true` de todos modos no puede colarse sin pagar la generación.
    expect(isPaidResume(true, [pendiente(1), pendiente(2)], [lote(1), lote(2)], H)).toBe(false)
  })

  it('resume:false nunca es reanudación real, tenga o no taskId pagados', () => {
    const existentes = [pagado(1)]
    expect(isPaidResume(false, existentes, existentes, H)).toBe(false)
  })

  it('sin lotes existentes, nunca es reanudación real', () => {
    expect(isPaidResume(true, [], [], H)).toBe(false)
  })

  // El caso central del fix round 4, y el que faltaba en la suite: MISMA cantidad de
  // lotes, contenido distinto. Re-adaptar el guión a uno completamente distinto que dé
  // la misma cantidad de lotes no es un caso exótico —los lotes se arman empaquetando
  // tomas en buckets de hasta 15 s—, y sin este chequeo el resultado era un video que
  // mezclaba el lote ya renderizado (guión viejo) con los nuevos (guión actual).
  it('misma cantidad de lotes pero contenido distinto: NO es reanudación real', () => {
    const otraHuella = scriptFingerprint(fpInput({ consistencyBlock: 'Hombre de 40' }))
    expect(isPaidResume(true, [pagado(1), pendiente(2)], [lote(1), lote(2)], otraHuella)).toBe(false)
  })

  it('un solo lote con la huella vieja (los demás al día) ya invalida la reanudación', () => {
    const mezcla = [pagado(1), lote(2, { scriptHash: 'otra-huella' })]
    expect(isPaidResume(true, mezcla, [lote(1), lote(2)], H)).toBe(false)
  })

  // Decisión explícita para las filas escritas antes de que existiera la huella: sin
  // huella no hay forma de verificar que el contenido sea el mismo, así que no se
  // reanudan (se cobran como generación nueva). Fail-closed.
  it('sesión sin huella guardada (scriptHash null o ausente): NO es reanudación real', () => {
    const legadoNull = [lote(1, { taskId: 't1', status: 'waiting' }), lote(2)]
    expect(isPaidResume(true, legadoNull, [lote(1), lote(2)], H)).toBe(false)

    // Fila anterior al campo: la clave no existe (undefined, no null).
    const legadoSinCampo = legadoNull.map((l) => {
      const { scriptHash: _omit, ...resto } = l
      return resto as Lote
    })
    expect(isPaidResume(true, legadoSinCampo, [lote(1), lote(2)], H)).toBe(false)
  })

  // El chequeo de longitud del fix round 3 sigue vivo como precondición local de
  // `resumeSeed` (la huella ya lo implica, pero el emparejamiento por índice merece
  // su propio guard donde se usa).
  it('el guión creció (más lotes en `base` que en `existentes`): NO es reanudación real', () => {
    expect(isPaidResume(true, [pagado(1), pendiente(2)], [lote(1), lote(2), lote(3)], H)).toBe(false)
  })

  it('el guión se encogió (menos lotes en `base` que en `existentes`): NO es reanudación real', () => {
    expect(isPaidResume(true, [pagado(1), pagado(2), pendiente(3)], [lote(1), lote(2)], H)).toBe(false)
  })
})

/**
 * ⚠️ Veo falla de forma TRANSITORIA. Medido: "The Google model was unable to generate
 * audio for this request. Please try a different prompt." en 1 de 5 lotes, y el MISMO
 * prompt salió bien al reintentarlo. Reintentar es la respuesta correcta — pero antes de
 * esto no se podía, porque un lote fallido conservaba su `taskId` y por tanto quedaba
 * fuera de `pendientes`.
 */
describe('resumeSeed — un lote fallido se vuelve a intentar', () => {
  const lote = (n: number, over: Partial<Lote> = {}): Lote => ({
    n, tomas: [], duracionSeg: 6, prompt: `p${n}`, taskId: null,
    status: 'idle', videoUrl: null, failMsg: null, scriptHash: 'h', ...over,
  })

  it('conserva los lotes con video y RECREA el que falló', () => {
    const base = [lote(1), lote(2), lote(3)]
    const existentes = [
      lote(1, { taskId: 't1', status: 'success', videoUrl: 'https://cdn/1.mp4' }),
      lote(2, { taskId: 't2', status: 'fail', failMsg: 'unable to generate audio' }),
      lote(3, { taskId: 't3', status: 'success', videoUrl: 'https://cdn/3.mp4' }),
    ]
    const seed = resumeSeed(base, existentes)
    expect(seed[0].taskId).toBe('t1')
    expect(seed[2].taskId).toBe('t3')
    // El fallido vuelve a `base`: sin taskId, así que entra en `pendientes` y se recrea.
    expect(seed[1].taskId).toBeNull()
    expect(seed[1].status).toBe('idle')
  })

  it('un lote en curso NO se recrea — todavía puede terminar bien', () => {
    const seed = resumeSeed([lote(1)], [lote(1, { taskId: 't1', status: 'generating' })])
    expect(seed[0].taskId).toBe('t1')
  })
})
