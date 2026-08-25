import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { clampTooBigStrings, refinePrompt } from './gemini'

// callStructured recorta los strings 'too_big' (Gemini ignora maxLength) en vez de 500-ear /copy.
describe('clampTooBigStrings', () => {
  const schema = z.object({
    sections: z.array(z.object({
      headline: z.string().max(10),
      cards: z.array(z.object({ body: z.string().max(5) })).optional(),
    })),
  })

  it('recorta strings anidados sobre el máximo y deja re-parsear', () => {
    const obj = { sections: [{ headline: 'x'.repeat(30), cards: [{ body: 'abcdefgh' }, { body: 'ok' }] }] }
    const first = schema.safeParse(obj)
    if (first.success) throw new Error('debía fallar')
    expect(clampTooBigStrings(obj, first.error)).toBe(true)
    const second = schema.safeParse(obj)
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.data.sections[0].headline).toHaveLength(10)
    expect(second.data.sections[0].cards![0].body).toBe('abcde')
    expect(second.data.sections[0].cards![1].body).toBe('ok') // no toca lo que ya cabía
  })

  it('no recorta un too_big que no es string (array/número) → sigue fallando', () => {
    const numSchema = z.object({ n: z.number().max(5) })
    const obj = { n: 10 }
    const r = numSchema.safeParse(obj)
    if (r.success) throw new Error('debía fallar')
    expect(clampTooBigStrings(obj, r.error)).toBe(false)
  })
})

import { sliceToWord } from './gemini'

describe('sliceToWord (recorte en límite de palabra)', () => {
  it('no toca strings dentro del límite', () => {
    expect(sliceToWord('Piel limpia', 60)).toBe('Piel limpia')
  })
  it('recorta en el último espacio (no a mitad de palabra) y quita separadores finales', () => {
    const s = 'Elimina las manchas en tu piel, Hidrata profundamente, Siéntete radiante'
    const out = sliceToWord(s, 60)
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out.endsWith('Sié') || out.endsWith('Siént')).toBe(false) // nunca palabra parcial
    expect(/[\s,;:.–—-]$/.test(out)).toBe(false) // sin separador final
    expect(out).toBe('Elimina las manchas en tu piel, Hidrata profundamente')
  })
})

// La regeneración perdía la adaptación demográfica: refine no ve el instructivo de STEP5 y
// las dos ramas enumeraban "product, logo, copy" sin nombrar a las personas, así que el modelo
// volvía al sujeto de la referencia (medido 2/2 con targetAudience "Mujeres de 20-40").
describe('refinePrompt', () => {
  for (const [caso, feedback] of [['sin feedback', ''], ['con feedback', 'titular en blanco']] as const) {
    it(`${caso}: ancla las personas a la imagen actual y prohíbe volver a la referencia`, () => {
      const p = refinePrompt(4, feedback)
      expect(p).toContain('exactly as they are in image 4')
      expect(p).toMatch(/NEVER revert them to the person shown in image 1/)
    })
  }

  it('sin feedback la imagen 1 sigue mandando el layout, pero solo el layout', () => {
    const p = refinePrompt(3, '')
    expect(p).toContain('layout, composition and format of')
    expect(p).toContain('copy ONLY the layout, never who appears in it')
  })

  // ⚠️ Mismo hueco, tercera vez. STEP5 congela el tratamiento tipográfico de la referencia y deja
  // que solo cambie el COLOR del texto; refine no lee ese instructivo. Sin el candado, la
  // regeneración re-tipografía el anuncio "para que combine con la marca" y deja de espejar a la
  // referencia, que es lo único que esta tool promete replicar. La rama SIN feedback es la más
  // expuesta: ahí se pide una variación, y la tipografía es lo primero que un modelo entiende por
  // "otra versión".
  for (const [caso, feedback] of [['sin feedback', ''], ['con feedback', 'titular en blanco']] as const) {
    it(`${caso}: congela la tipografía y deja pasar solo el color`, () => {
      const p = refinePrompt(4, feedback)
      expect(p).toContain('typographic treatment in image 4')
      expect(p).toMatch(/Only the text COLOR may differ/)
      expect(p).toMatch(/Never restyle, re-set or "modernize" the type/)
      expect(p).toMatch(/never resize one text block relative to another/)
    })
  }

  // Mismo hueco, segunda mitad: STEP5 re-apunta los marcadores a la zona del producto y
  // recolorea con la marca del usuario. Sin nombrarlos, la imagen 1 los tira de vuelta.
  for (const [caso, feedback] of [['sin feedback', ''], ['con feedback', 'titular en blanco']] as const) {
    it(`${caso}: ancla la zona señalada y la paleta a la imagen actual`, () => {
      const p = refinePrompt(4, feedback)
      expect(p).toContain('attention markers in image 4')
      expect(p).toMatch(/NEVER re-aim them at the zone shown in image 1/)
      expect(p).toMatch(/never restore image 1's colors/)
    })
  }

  it('con feedback el cambio sigue siendo exclusivo', () => {
    const p = refinePrompt(3, 'titular en blanco')
    expect(p).toContain('Change request: titular en blanco')
    expect(p).toContain('pixel-identical')
  })
})
