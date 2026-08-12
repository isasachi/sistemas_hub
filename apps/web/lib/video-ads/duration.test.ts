import { describe, it, expect } from 'vitest'
import { beatEndSeconds, scriptDuration, AIR_SEC } from './duration'

// `t` lo escribe un LLM en formato libre. El caso real que motivó esto usaba el guion
// largo ("0:00–0:03"); si el parser solo entendiera el guion corto, TODOS los beats
// caerían a null y la duración volvería en silencio a la de la referencia — que es
// justo el bug que esto arregla.

describe('beatEndSeconds', () => {
  it('lee el extremo derecho de un rango, con cualquier guion', () => {
    expect(beatEndSeconds('0:00–0:03')).toBe(3) // en dash (el que emite Gemini)
    expect(beatEndSeconds('0:00-0:03')).toBe(3) // hyphen
    expect(beatEndSeconds('0:00—0:03')).toBe(3) // em dash
    expect(beatEndSeconds('0:00 to 0:03')).toBe(3)
    expect(beatEndSeconds('0:04 – 0:09')).toBe(9)
  })

  it('acepta minutos, segundos sueltos y sufijo s', () => {
    expect(beatEndSeconds('1:04')).toBe(64)
    expect(beatEndSeconds('0:12')).toBe(12)
    expect(beatEndSeconds('12')).toBe(12)
    expect(beatEndSeconds('3s')).toBe(3)
  })

  it('devuelve null ante lo que no entiende', () => {
    expect(beatEndSeconds('')).toBeNull()
    expect(beatEndSeconds('al final')).toBeNull()
    expect(beatEndSeconds('0:00–')).toBeNull()
    expect(beatEndSeconds('1:2:3:4')).toBeNull()
  })
})

describe('scriptDuration', () => {
  it('toma el fin del último beat y le suma el aire', () => {
    const beats = [{ t: '0:00–0:03' }, { t: '0:03–0:08' }, { t: '0:08–0:14' }]
    expect(scriptDuration(beats)).toBe(14 + AIR_SEC)
  })

  it('no asume que los beats vengan ordenados', () => {
    expect(scriptDuration([{ t: '0:08–0:14' }, { t: '0:00–0:03' }])).toBe(14 + AIR_SEC)
  })

  it('ignora los beats ilegibles pero usa los demás', () => {
    expect(scriptDuration([{ t: '0:00–0:05' }, { t: 'final' }])).toBe(5 + AIR_SEC)
  })

  it('null cuando NINGÚN beat es legible: el caller cae a la referencia', () => {
    expect(scriptDuration([{ t: 'inicio' }, { t: 'final' }])).toBeNull()
    expect(scriptDuration([])).toBeNull()
  })

  // El caso del reporte: referencia de 28.3s cuyo tramo final era la placa de TikTok.
  // Con el outro fuera del análisis, el guión dura ~20s y el render deja de inventar.
  it('un guión más corto que la referencia da un video más corto', () => {
    const beats = Array.from({ length: 6 }, (_, i) => ({ t: `0:${String(i * 3).padStart(2, '0')}–0:${String(i * 3 + 3).padStart(2, '0')}` }))
    expect(scriptDuration(beats)).toBe(18 + AIR_SEC)
  })
})
