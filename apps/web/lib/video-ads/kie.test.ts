import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildTaskBody, clampDuration, resolutionFor, parseTaskDetail, createVideoTask,
  MIN_DURATION, MAX_DURATION, MAX_IMAGES, KIE_PROMPT_MAX, resolveKey,
} from './kie'
import { CPS_MAX, CPS_MIN } from './forensic'

// Sin API key no se puede probar el render en vivo, así que lo que se verifica acá es el
// CONTRATO con `grok-imagine/image-to-video` — las reglas que, si se rompen, devuelven
// 422 con la cuota ya gastada o un video silenciosamente malo:
//   - `duration` es STRING y va entre 6 y 30 (el grok viejo era INTEGER 1–15, Veo era
//     el conjunto {4,6,8}: los tres contratos son distintos);
//   - `prompt` <= 5000 caracteres;
//   - hasta 7 imágenes, y `aspect_ratio` es inválido con UNA sola;
//   - `nsfw_checker: true` = filtro ACTIVADO (el default de la API es false, que lo apaga).
// Si alguien cambia MODEL, estos asserts tienen que cambiar con él.

const IMAGES = [
  { url: 'https://cdn.test/persona.png', role: 'la persona' },
  { url: 'https://cdn.test/producto.png', role: 'el producto' },
]

afterEach(() => vi.unstubAllGlobals())

describe('clampDuration', () => {
  it('nunca sale del rango legal del modelo', () => {
    for (const sec of [0.6, 1, 3.4, 6, 12.5, 29, 30, 44, 0, -4, NaN, Infinity]) {
      const d = clampDuration(sec)
      expect(d).toBeGreaterThanOrEqual(MIN_DURATION)
      expect(d).toBeLessThanOrEqual(MAX_DURATION)
      expect(Number.isInteger(d)).toBe(true)
    }
  })

  it('conserva la duración de la toma cuando ya es legal', () => {
    expect(clampDuration(12)).toBe(12)
    expect(clampDuration(29.4)).toBe(29)
    // El cap nuevo es 30: una toma de 24 s ya NO se parte en cuatro clips como con Veo.
    expect(clampDuration(24)).toBe(24)
  })

  it('sube al mínimo del modelo lo que dura menos de 6 s', () => {
    // Un lote de cola corta existe; el mínimo de la API es 6 y deja algo de aire, que es
    // preferible a no poder renderizarlo.
    expect(clampDuration(0.6)).toBe(MIN_DURATION)
    expect(clampDuration(3)).toBe(MIN_DURATION)
  })

  it('nunca elige una duración en la que la locución no entre a CPS_MAX', () => {
    // 400 caracteres necesitan >= 20 s a 20 car/s, aunque la toma durase 8.
    expect(clampDuration(8, 400)).toBeGreaterThanOrEqual(400 / CPS_MAX)
    // Y el piso duro gana al techo blando cuando chocan.
    expect(clampDuration(6, 700)).toBe(MAX_DURATION)
  })

  // ⚠️ EL OTRO LADO DEL MISMO PROBLEMA, medido en un render real de la época de Veo: 23
  // caracteres en 6 s (3,8 car/s) hicieron que el modelo dijera la frase DOS VECES para
  // llenar el audio. La lección sobrevive al cambio de modelo, PERO acotada a un clip de
  // UNA escena, que es el caso en el que se midió.
  it('una locución corta no deja medio vacío un clip de UNA escena', () => {
    const d = clampDuration(28, 120, 1)
    expect(120 / d).toBeGreaterThanOrEqual(CPS_MIN)
  })

  // ⚠️ Y ACÁ ESTÁ EL ACOTE, que con el cap de 30 s es obligatorio. Sin él, el techo
  // blando recorta el clip a lo que "merece" su texto y descarta en silencio las escenas
  // de más — justo las que ya tienen su imagen ancla generada y pagada.
  it('un clip de VARIAS escenas conserva su duración aunque el diálogo sea escaso', () => {
    // Los dos casos medidos: sin el acote caían a 22 s y a 13 s respectivamente.
    expect(clampDuration(30, 200, 5)).toBe(30)
    expect(clampDuration(30, 120, 8)).toBe(30)
  })

  it('el piso duro sigue mandando con varias escenas: el texto tiene que poder decirse', () => {
    // 700 caracteres no entran en 20 s a CPS_MAX, así que sube igual.
    expect(clampDuration(20, 700, 6)).toBe(MAX_DURATION)
  })

  it('una toma MUDA conserva su duración: no hay audio que rellenar', () => {
    expect(clampDuration(19, 0)).toBe(19)
    expect(clampDuration(30, 0)).toBe(30)
  })

  it('la densidad resultante se queda dentro de la banda decible', () => {
    for (const [sec, chars] of [[12, 200], [20, 340], [8, 120]] as const) {
      const cps = chars / clampDuration(sec, chars)
      expect(cps).toBeLessThanOrEqual(CPS_MAX)
      expect(cps).toBeGreaterThanOrEqual(CPS_MIN)
    }
  })

  // `generate-lotes` ajusta una vez para el texto del prompt y `buildTaskBody` vuelve a
  // ajustar para el body. Si no coincidieran, el prompt prometería una duración y el
  // modelo renderizaría otra, y el audio saldría cortado.
  it('aplicarla dos veces da lo mismo que una', () => {
    for (const sec of [0.6, 6, 12.5, 24, 29.9, 40]) {
      for (const chars of [0, 23, 120, 200, 400, 700]) {
        const una = clampDuration(sec, chars)
        expect(clampDuration(una, chars)).toBe(una)
      }
    }
  })
})

describe('buildTaskBody', () => {
  it('manda el contrato del marketplace de grok, vertical y 720p', () => {
    const b = buildTaskBody({ images: IMAGES, prompt: 'hola', durationSec: 12 })
    expect(b.model).toBe('grok-imagine/image-to-video')
    // ⚠️ Todo cuelga de `input`, no de la raíz — Veo era plano y grok anida.
    expect(b.input.aspect_ratio).toBe('9:16')
    expect(b.input.resolution).toBe('720p')
    expect(b.input.image_urls).toEqual(IMAGES.map((i) => i.url))
    expect(b.input.mode).toBe('normal')
  })

  // El fallo silencioso más caro de este contrato: number pasa el typecheck del objeto
  // pero la API lo rechaza con 422 y la cuota ya gastada.
  it('la duración viaja como STRING, no como número', () => {
    const b = buildTaskBody({ images: IMAGES, prompt: 'x', durationSec: 12 })
    expect(typeof b.input.duration).toBe('string')
    expect(b.input.duration).toBe('12')
  })

  // ⚠️ `false` DESACTIVA el filtro y es el default de la API. Queremos lo contrario.
  it('deja el filtro de contenido ACTIVADO', () => {
    expect(buildTaskBody({ images: IMAGES, prompt: 'x', durationSec: 6 }).input.nsfw_checker).toBe(true)
  })

  it('respeta la locución al elegir la duración del body', () => {
    const b = buildTaskBody({ images: IMAGES, prompt: 'x', durationSec: 6, locucionChars: 400 })
    expect(Number(b.input.duration)).toBeGreaterThanOrEqual(400 / CPS_MAX)
  })

  it('resolutionFor es 720p fijo — 1080p además exige una sola imagen', () => {
    expect(resolutionFor()).toBe('720p')
  })

  it('los topes son los de ESTE modelo, no los de Veo ni los del grok viejo', () => {
    expect(KIE_PROMPT_MAX).toBe(5000)
    expect(MAX_IMAGES).toBe(7)
    expect(MIN_DURATION).toBe(6)
    expect(MAX_DURATION).toBe(30)
  })
})

describe('parseTaskDetail', () => {
  // ⚠️ El marketplace usa `state` STRING y `resultJson` como STRING con JSON adentro.
  // Veo usaba `successFlag` numérico y un array. Mezclar los parsers deja el polling
  // esperando para siempre un video que ya está listo.
  it('lee el estado del campo `state` y la URL de `resultJson` parseado', () => {
    const d = parseTaskDetail({
      state: 'success',
      resultJson: JSON.stringify({ resultUrls: ['https://cdn.test/v.mp4'] }),
    })
    expect(d.state).toBe('success')
    expect(d.videoUrl).toBe('https://cdn.test/v.mp4')
  })

  it('los estados en curso no se leen como terminados', () => {
    for (const s of ['waiting', 'queuing', 'generating']) {
      expect(parseTaskDetail({ state: s }).state).toBe(s)
      expect(parseTaskDetail({ state: s }).videoUrl).toBeNull()
    }
    // Sin campo alguno tampoco puede leerse como terminado: el polling seguiría.
    expect(parseTaskDetail({}).state).toBe('waiting')
    expect(parseTaskDetail(null).state).toBe('waiting')
  })

  it('`fail` propaga el motivo', () => {
    const d = parseTaskDetail({ state: 'fail', failMsg: 'content rejected' })
    expect(d.state).toBe('fail')
    expect(d.failMsg).toBe('content rejected')
    expect(d.videoUrl).toBeNull()
  })

  it('un resultJson corrupto o vacío no inventa una URL', () => {
    expect(parseTaskDetail({ state: 'success', resultJson: '{{{' }).videoUrl).toBeNull()
    expect(parseTaskDetail({ state: 'success', resultJson: '{"resultUrls":[]}' }).videoUrl).toBeNull()
    expect(parseTaskDetail({ state: 'success' }).videoUrl).toBeNull()
  })
})

describe('createVideoTask', () => {
  const ok = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))

  it('devuelve el taskId cuando la creación es real', async () => {
    ok({ code: 200, msg: 'success', data: { taskId: 'grok_1' } })
    await expect(createVideoTask({ images: IMAGES, prompt: 'x', durationSec: 12 }, 'key-del-usuario'))
      .resolves.toBe('grok_1')
  })

  it('un error que viene DENTRO de un HTTP 200 tiene que lanzar', async () => {
    // KIE devuelve status 200 con `code` de error adentro. Mirar solo `res.ok` dejaría
    // pasar el fallo como éxito, y el polling esperaría para siempre un taskId que no
    // existe — el lote quedaría "generando" sin nada detrás.
    ok({ code: 422, msg: 'duration must be between 6 and 30' })
    await expect(createVideoTask({ images: IMAGES, prompt: 'x', durationSec: 12 }, 'key-del-usuario'))
      .rejects.toThrow(/422/)
  })
})

/**
 * BYOK estricto: `resolveKey` ya NO cae a `process.env.KIE_API_KEY`. El fallback hacía
 * que el hub pagara renders ajenos en silencio — el peor modo de fallo posible para un
 * control de costo.
 */
describe('resolveKey', () => {
  it('sin key del usuario lanza aunque el entorno tenga una', () => {
    vi.stubEnv('KIE_API_KEY', 'key-del-hub')
    expect(() => resolveKey(null)).toThrow(/API key de KIE/)
    expect(() => resolveKey('   ')).toThrow(/API key de KIE/)
    vi.unstubAllEnvs()
  })

  it('devuelve la del usuario, recortada', () => {
    expect(resolveKey('  key-del-usuario  ')).toBe('key-del-usuario')
  })
})
