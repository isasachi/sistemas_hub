import { describe, it, expect } from 'vitest'
import {
  buildTaskBody, buildVideoPrompt, clampDuration, resolutionFor, parseTaskDetail,
  isCaptionEcho, stripPlatformFurniture,
} from './kie'

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

describe('buildVideoPrompt', () => {
  const prompt = buildVideoPrompt({
    images: IMAGES,
    direction: { accent: 'peruano', vibe: 'minimal', cameraMotion: 'stationary', eyeDirection: 'center' },
    beats: [{ t: '0:00–0:03', dialogue: 'Esto me cambió el pelo', action: 'muestra el frasco', onScreenText: '3 meses' }],
    productName: 'Serum X',
  })

  it('numera las imágenes en el mismo orden que image_urls', () => {
    expect(prompt).toContain('@image(1) = la persona')
    expect(prompt).toContain('@image(2) = el producto')
    expect(prompt.indexOf('@image(1)')).toBeLessThan(prompt.indexOf('@image(2)'))
  })

  it('incluye diálogo, acción y texto en pantalla del beat', () => {
    expect(prompt).toContain('Esto me cambió el pelo')
    expect(prompt).toContain('muestra el frasco')
    expect(prompt).toContain('3 meses')
  })

  it('exige español neutro en el audio', () => {
    expect(prompt).toContain('neutral Latin-American Spanish')
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

// Las dos defensas contra lo que se replicó en el render reportado. Los casos salen
// literales del análisis forense de esa sesión (Supabase), no son inventados.
describe('limpieza de la referencia', () => {
  it('detecta el texto en pantalla que solo repite el diálogo (= subtítulos)', () => {
    expect(isCaptionEcho('este suero de Eunoia y tengo que contarte.', 'este suero de Eunoia y tengo que contarte.')).toBe(true)
    expect(isCaptionEcho('Se siente tan ligero y se absorbe', 'se siente tan ligero y se absorbe.')).toBe(true)
    expect(isCaptionEcho('rápido y no queda pegajoso.', 'rápido y no queda pegajoso')).toBe(true)
  })

  it('conserva un gráfico real, que dice algo que la voz no dice', () => {
    expect(isCaptionEcho('Está a mitad de precio', 'S/ 49')).toBe(false)
    expect(isCaptionEcho('mira cómo quedó', 'ANTES / DESPUÉS')).toBe(false)
    expect(isCaptionEcho('', 'ANTES')).toBe(false)
  })

  it('borra la interfaz de la plataforma de una descripción visual', () => {
    const real = "The woman looks down at the serum bottle. The TikTok logo and '@serumanuaperu' are visible in the top left."
    expect(stripPlatformFurniture(real)).toBe('The woman looks down at the serum bottle.')
  })

  it('deja intacto lo que no menciona la plataforma', () => {
    const clean = 'She smiles broadly at the camera, touching her chin and jawline.'
    expect(stripPlatformFurniture(clean)).toBe(clean)
  })
})

describe('buildVideoPrompt — lo que NO debe replicar de la referencia', () => {
  const DIRECTION = { accent: 'neutro', vibe: 'natural', cameraMotion: 'stationary', eyeDirection: 'center' }
  const BEATS = [{ t: '0:00-0:03', dialogue: 'hola', action: 'saluda', onScreenText: 'hola' }]

  it('no dicta subtítulos: el eco del diálogo no llega como gráfico', () => {
    const p = buildVideoPrompt({ images: IMAGES, direction: DIRECTION, beats: BEATS, productName: 'X' })
    expect(p).not.toContain('On-screen graphic: "hola"')
    expect(p).toContain('Keep the frame completely clean of text')
  })

  it('prohíbe marca de agua, placa de cierre y relleno inventado', () => {
    const p = buildVideoPrompt({ images: IMAGES, direction: DIRECTION, beats: BEATS, productName: 'X' })
    expect(p).toMatch(/watermark/i)
    expect(p).toMatch(/end card/i)
    expect(p).toMatch(/Do not invent extra dialogue/i)
  })

  it('sin forense (líneas 2 y 3) no inventa bloque de casting', () => {
    const p = buildVideoPrompt({ images: IMAGES, direction: DIRECTION, beats: BEATS, productName: 'X' })
    expect(p).not.toContain('CASTING')
  })

  it('con forense manda el casting y la cámara de cada beat', () => {
    const p = buildVideoPrompt({
      images: IMAGES, direction: DIRECTION, beats: BEATS, productName: 'X',
      forensic: {
        durationSec: 20, aspectRatio: '9:16',
        subject: 'Mujer de 20s, cabello negro recogido, piel clara, ojos claros',
        setting: 'dormitorio', productHandling: 'sostiene el frasco', audio: 'voz directa',
        hookType: 'pregunta', persuasiveLogic: 'prueba personal', summaryForUser: 'x',
        beats: [{ t: '0:00-0:03', visual: 'primer plano', dialogue: 'hola', onScreenText: '', camera: 'close-up fijo', emotion: 'amable' }],
      },
    })
    expect(p).toContain('CASTING')
    expect(p).toContain('cabello negro recogido')
    expect(p).toContain('Camera: close-up fijo')
  })
})
