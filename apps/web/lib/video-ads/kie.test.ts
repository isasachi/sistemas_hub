import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildTaskBody, snapDuration, resolutionFor, parseTaskDetail, createVideoTask,
  DURATIONS, KIE_PROMPT_MAX, resolveKey,
} from './kie'
import { CPS_MAX, CPS_MIN } from './forensic'

// Sin API key no se puede probar el render en vivo, así que lo que se verifica acá es el
// CONTRATO con Veo 3.1 — las reglas que, si se rompen, devuelven 422 con la cuota ya
// gastada o un video silenciosamente malo. Todas fueron MEDIDAS contra la API real el
// 2026-08-19; los números no son de la documentación, salen de respuestas verdaderas:
//   - duración EXACTAMENTE 4, 6 u 8 ("Duration must be 4, 6 or 8 seconds");
//   - prompt <= 60000 ("The prompt word cannot exceed 60000 characters");
//   - generationType decide qué significan las imágenes, y los modos son excluyentes.
// Si alguien cambia MODEL, estos asserts tienen que cambiar con él.

const IMAGES = [
  { url: 'https://cdn.test/persona.png', role: 'la persona' },
  { url: 'https://cdn.test/producto.png', role: 'el producto' },
]

afterEach(() => vi.unstubAllGlobals())

describe('snapDuration', () => {
  it('solo devuelve duraciones que Veo acepta', () => {
    for (const sec of [0.6, 1, 3.4, 4, 5.5, 6, 7.2, 8, 11.9, 30, 0, -4, NaN, Infinity]) {
      expect(DURATIONS).toContain(snapDuration(sec))
    }
  })

  it('elige la duración legal más cercana a la de la toma', () => {
    expect(snapDuration(4.2)).toBe(4)
    expect(snapDuration(5.4)).toBe(6)
    expect(snapDuration(7.9)).toBe(8)
    // Una toma de menos de 4 s no existe en Veo: el piso legal la levanta a 4. Es lo que
    // hace desaparecer los clips de ~1 s que daba grok (tres de siete en la prueba real).
    expect(snapDuration(0.6)).toBe(4)
  })

  it('nunca elige una duración en la que la locución no entre a CPS_MAX', () => {
    // 140 caracteres necesitan >= 7 s a 20 car/s: 4 y 6 quedan descartadas aunque la
    // toma durara 4 s. Preferir el silencio a cortar diálogo a mitad de frase.
    const texto = 140
    expect(texto / CPS_MAX).toBeGreaterThan(6)
    expect(snapDuration(4, texto)).toBe(8)
  })

  // ⚠️ EL OTRO LADO DEL MISMO PROBLEMA, medido en un render real. El lote 2 de la sesión
  // `02fa1205` tenía 23 caracteres en 6 s (3,8 car/s) y Veo dijo la frase DOS VECES para
  // llenar el audio: "Y es nuestro mural y es nuestro top mural". Antes solo se
  // comprobaba que el texto CUPIERA, nunca que no sobrara demasiado.
  it('una locución muy corta baja a la duración legal más chica en vez de dejar hueco', () => {
    // El caso real, con sus números: 23 car, toma de 5.4 s → antes daba 6.
    expect(snapDuration(5.4, 23)).toBe(4)
    expect(23 / 4).toBeGreaterThan(23 / 6) // y queda más densa que antes
  })

  it('no toca las locuciones de densidad normal — no pelea con la variación real', () => {
    // Los otros cuatro lotes de esa misma sesión, que salieron bien.
    expect(snapDuration(5.1, 65)).toBe(6)
    expect(snapDuration(5.2, 83)).toBe(6)
    expect(snapDuration(6.0, 84)).toBe(6)
  })

  it('una toma MUDA conserva su duración: no hay audio que rellenar', () => {
    // Sin habla no hay nada que repetir, y la duración es un beat visual del original.
    expect(snapDuration(5.3, 0)).toBe(6)
    expect(snapDuration(7.8, 0)).toBe(8)
  })

  it('la densidad resultante nunca queda por debajo del piso, salvo que sea imposible', () => {
    // 60 car: el rango bueno es [3, 6.67] → 4 y 6 sirven.
    for (const [sec, chars] of [[5.4, 60], [7.5, 90], [4.2, 40]] as const) {
      const d = snapDuration(sec, chars)
      const cps = chars / d
      expect(cps).toBeLessThanOrEqual(CPS_MAX)
      expect(cps).toBeGreaterThanOrEqual(CPS_MIN)
    }
  })

  it('con empate se queda con la más corta, para no inflar el anuncio', () => {
    expect(snapDuration(5)).toBe(4)
    expect(snapDuration(7)).toBe(6)
  })

  it('devuelve el techo cuando el texto no entra ni en 8 s', () => {
    // Caso de toma que tendría que haberse partido antes (`splitLongToma`). Acá no se
    // puede arreglar: se devuelve el máximo legal en vez de inventar una duración.
    expect(snapDuration(8, 400)).toBe(8)
  })

  // `generate-lotes` ajusta una vez para el texto del prompt y `buildTaskBody` vuelve a
  // ajustar para el body. Si no coincidieran, el prompt prometería una duración y el
  // modelo renderizaría otra, y el audio saldría cortado.
  //
  // Ojo: la propiedad es que ajustar DOS VECES da lo mismo que una, no que una duración
  // ya legal quede intacta — con el piso de densidad, una duración legal pero demasiado
  // larga para su texto SÍ tiene que bajar, y ese es justamente el arreglo.
  it('aplicarla dos veces da lo mismo que una', () => {
    for (const sec of [0.6, 4, 5.4, 6, 7.9, 11.2]) {
      for (const chars of [0, 23, 30, 65, 84, 140, 400]) {
        const una = snapDuration(sec, chars)
        expect(snapDuration(una, chars)).toBe(una)
      }
    }
  })
})

describe('buildTaskBody', () => {
  it('manda el contrato de Veo 3.1 fast vertical', () => {
    const b = buildTaskBody({ images: IMAGES, prompt: 'hola', durationSec: 6 })
    expect(b.model).toBe('veo3_fast')
    expect(b.aspect_ratio).toBe('9:16')
    expect(b.resolution).toBe('720p')
    expect(b.imageUrls).toEqual(IMAGES.map((i) => i.url))
    expect(DURATIONS).toContain(b.duration)
  })

  it('traduce el modo al generationType correcto — son excluyentes', () => {
    const frames = buildTaskBody({ images: IMAGES, prompt: 'x', durationSec: 4, mode: 'frames' })
    expect(frames.generationType).toBe('FIRST_AND_LAST_FRAMES_2_VIDEO')
    const ref = buildTaskBody({ images: IMAGES, prompt: 'x', durationSec: 4, mode: 'reference' })
    expect(ref.generationType).toBe('REFERENCE_2_VIDEO')
    // Sin `mode` explícito se comporta como el render de hoy, no como el nuevo.
    expect(buildTaskBody({ images: IMAGES, prompt: 'x', durationSec: 4 }).generationType)
      .toBe('REFERENCE_2_VIDEO')
  })

  it('respeta la locución al elegir la duración del body', () => {
    const b = buildTaskBody({ images: IMAGES, prompt: 'x', durationSec: 4, locucionChars: 140 })
    expect(b.duration).toBe(8)
  })

  it('resolutionFor es 720p fijo', () => {
    expect(resolutionFor()).toBe('720p')
  })

  it('el tope de prompt es el medido, no el de grok', () => {
    expect(KIE_PROMPT_MAX).toBe(60000)
  })
})

describe('parseTaskDetail', () => {
  it('successFlag 1 con las URLs en response.resultUrls (array, no string JSON)', () => {
    const d = parseTaskDetail({
      successFlag: 1,
      response: { resultUrls: ['https://cdn.test/v.mp4'] },
    })
    expect(d.state).toBe('success')
    expect(d.videoUrl).toBe('https://cdn.test/v.mp4')
  })

  it('successFlag 0 es "en curso", no un fallo', () => {
    expect(parseTaskDetail({ successFlag: 0 }).state).toBe('generating')
    // Sin campo alguno tampoco puede leerse como terminado: el polling seguiría.
    expect(parseTaskDetail({}).state).toBe('generating')
    expect(parseTaskDetail(null).state).toBe('generating')
  })

  it('successFlag 2 y 3 son fallo y propagan el motivo', () => {
    for (const flag of [2, 3]) {
      const d = parseTaskDetail({ successFlag: flag, errorMessage: 'content rejected' })
      expect(d.state).toBe('fail')
      expect(d.failMsg).toBe('content rejected')
      expect(d.videoUrl).toBeNull()
    }
  })

  it('un éxito sin URL utilizable no inventa una', () => {
    expect(parseTaskDetail({ successFlag: 1, response: { resultUrls: [] } }).videoUrl).toBeNull()
    expect(parseTaskDetail({ successFlag: 1, response: {} }).videoUrl).toBeNull()
  })
})

describe('createVideoTask', () => {
  const ok = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))

  it('devuelve el taskId cuando la creación es real', async () => {
    ok({ code: 200, msg: 'success', data: { taskId: 'veo_1' } })
    await expect(createVideoTask({ images: IMAGES, prompt: 'x', durationSec: 6 }, 'key-del-usuario'))
      .resolves.toBe('veo_1')
  })

  it('un 422 que viene DENTRO de un HTTP 200 tiene que lanzar', async () => {
    // Veo devuelve status 200 con `code: 422` en los errores de validación. Mirar solo
    // `res.ok` dejaría pasar el fallo como éxito, y el polling esperaría para siempre un
    // taskId que no existe — el lote quedaría "generando" sin nada detrás.
    ok({ code: 422, msg: 'Duration must be 4, 6 or 8 seconds' })
    await expect(createVideoTask({ images: IMAGES, prompt: 'x', durationSec: 6 }, 'key-del-usuario'))
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
