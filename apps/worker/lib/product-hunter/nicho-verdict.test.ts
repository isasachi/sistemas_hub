import { describe, it, expect } from 'vitest'
import { limpiarTextos } from './nicho-verdict'

// El fallo real: `product-key.ts` corta el cuerpo del anuncio en 400 caracteres
// y, si el corte cae dentro de un emoji, deja medio par de surrogates. OpenAI
// rechaza el REQUEST ENTERO con 400 (reproducido contra la API), así que el
// anunciante se pierde sin veredicto. Un texto que no se pueda serializar no
// puede llegar al modelo.
describe('limpiarTextos — el texto tiene que poder viajar como JSON', () => {
  const roto = 'crema para el acne \ud83d'   // 🔥 cortado a la mitad

  it('repara el medio emoji que deja un corte a mitad de par', () => {
    const [t] = limpiarTextos([roto])
    expect(t.isWellFormed()).toBe(true)
    // La prueba que importa: el cuerpo del request se puede parsear de vuelta.
    expect(() => JSON.parse(JSON.stringify({ content: t }))).not.toThrow()
  })

  it('no toca un emoji completo — es contenido real del anuncio', () => {
    expect(limpiarTextos(['oferta 🔥 en crema de acne'])[0]).toContain('🔥')
  })

  it('sigue quitando plantillas sin renderizar y lo que no dice nada', () => {
    expect(limpiarTextos(['{{product_name}} crema para el acne severo'])[0])
      .toBe('crema para el acne severo')
    expect(limpiarTextos(['corto'])).toEqual([])
  })
})
