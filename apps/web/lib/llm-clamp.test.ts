import { describe, it, expect } from 'vitest'
import { sliceToWord } from './llm-clamp'

// ⚠️ EL CASO MEDIDO EN UNA LANDING REAL. El titular de cierre traía tres frases y el recorte lo
// dejó en exactamente 90 caracteres —el tope del schema— terminando en "Hazlo 5": entero como
// palabra, sin sentido como frase, e impreso dentro de la imagen.
describe('sliceToWord', () => {
  const TITULAR = 'Snacks blandos que encantan a tu perro. Un placer saludable para su día a día. Hazlo 5 veces al día.'

  it('tira la frase incompleta entera en vez de dejar un muñón', () => {
    const out = sliceToWord(TITULAR, 90)
    expect(out).toBe('Snacks blandos que encantan a tu perro. Un placer saludable para su día a día.')
    expect(out).not.toMatch(/Hazlo/)
  })

  it('sin ningún fin de frase cae al límite de palabra, como antes', () => {
    expect(sliceToWord('palabra '.repeat(20).trim(), 30)).toBe('palabra palabra palabra')
  })

  it('no toca lo que ya entra', () => {
    expect(sliceToWord('corto y completo', 90)).toBe('corto y completo')
  })

  // El fin de frase solo manda si queda pasada la mitad del cupo: si no, se perdería casi todo.
  it('ignora un punto demasiado temprano', () => {
    const out = sliceToWord('Ya. Una frase larga que sigue y sigue sin puntuación alguna', 40)
    expect(out).not.toBe('Ya.')
    expect(out.length).toBeLessThanOrEqual(40)
  })
})
