import { describe, it, expect } from 'vitest'
import { buildTaskBody, clampDuration, resolutionFor, parseTaskDetail } from './kie'

// Sin API key no se puede probar el render en vivo, así que lo que se verifica acá es
// el CONTRATO con KIE (modelo grok-imagine-video-1-5-preview): las reglas que, si se
// rompen, devuelven 422 o un video silenciosamente malo — duración ENTERA 1–15, sin
// `mode` (input es additionalProperties:false), aspect_ratio 9:16, 720p, prompt con
// leyenda @image(n).
// Ojo: el otro modelo del marketplace (grok-imagine/image-to-video) usa string 6–30 y
// sí acepta `mode`. Si alguien cambia MODEL, estos asserts deben cambiar con él.

const IMAGES = [
  { url: 'https://x.supabase.co/a.png?v=1', role: 'la persona' },
  { url: 'https://x.supabase.co/b.png?v=2', role: 'el producto' },
]

describe('buildTaskBody', () => {
  it('usa el modelo 1.5-preview', () => {
    expect(buildTaskBody({ images: IMAGES, prompt: 'p', durationSec: 10 }).model)
      .toBe('grok-imagine-video-1-5-preview')
  })

  it('manda duration como ENTERO dentro de 1–15', () => {
    const body = buildTaskBody({ images: IMAGES, prompt: 'p', durationSec: 12 })
    expect(body.input.duration).toBe(12)
    expect(typeof body.input.duration).toBe('number')
    expect(buildTaskBody({ images: IMAGES, prompt: 'p', durationSec: 0 }).input.duration).toBe(1)
    // Una referencia de 30 s se recorta a 15: es el techo de este modelo.
    expect(buildTaskBody({ images: IMAGES, prompt: 'p', durationSec: 30 }).input.duration).toBe(15)
    expect(clampDuration(NaN)).toBe(8)
  })

  it('no manda `mode` (input es additionalProperties:false en 1.5)', () => {
    expect(buildTaskBody({ images: IMAGES, prompt: 'p', durationSec: 10 }).input)
      .not.toHaveProperty('mode')
  })

  it('fuerza 9:16 (el default de la API es `auto`)', () => {
    expect(buildTaskBody({ images: IMAGES, prompt: 'p', durationSec: 10 }).input.aspect_ratio).toBe('9:16')
  })

  it('renderiza en 720p en las tres líneas, con una imagen o con dos', () => {
    expect(resolutionFor()).toBe('720p')
    expect(buildTaskBody({ images: IMAGES, prompt: 'p', durationSec: 10 }).input.resolution).toBe('720p')
    expect(buildTaskBody({ images: [IMAGES[0]], prompt: 'p', durationSec: 10 }).input.resolution).toBe('720p')
  })

  it('conserva el orden de las imágenes (el prompt las referencia por índice)', () => {
    expect(buildTaskBody({ images: IMAGES, prompt: 'p', durationSec: 10 }).input.image_urls).toEqual([
      IMAGES[0].url,
      IMAGES[1].url,
    ])
  })
})

describe('parseTaskDetail', () => {
  it('saca la url del resultJson (que viene como string)', () => {
    const d = parseTaskDetail({
      state: 'success',
      progress: 100,
      resultJson: '{"resultUrls":["https://cdn.kie.ai/v.mp4"]}',
    })
    expect(d.state).toBe('success')
    expect(d.videoUrl).toBe('https://cdn.kie.ai/v.mp4')
  })

  it('no revienta con resultJson vacío, corrupto o tarea en curso', () => {
    expect(parseTaskDetail({ state: 'generating', progress: 40 }).videoUrl).toBeNull()
    expect(parseTaskDetail({ state: 'success', resultJson: 'no-json' }).videoUrl).toBeNull()
    expect(parseTaskDetail(null).state).toBe('waiting')
  })

  it('propaga el mensaje de error de una tarea fallida', () => {
    expect(parseTaskDetail({ state: 'fail', failMsg: 'content rejected' }).failMsg).toBe('content rejected')
  })
})
