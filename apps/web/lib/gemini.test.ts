import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { clampTooBigStrings } from './gemini'

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
