import { describe, it, expect } from 'vitest'
import { buildValidationMatrix, canProceed, capMaxReached, CONFIRMACION_REQUERIDA } from './validation'
import type { UserInputs } from './types'

const FULL: UserInputs = {
  productName: 'Serum Eunoia',
  productDescription: 'Suero de niacinamida para marcas de acné',
  angle: 'Testimonio de resultados en 4 semanas',
  targetAudience: 'Mujeres 20-35 con piel grasa',
  problem: 'Marcas de acné que no se van',
  characterDesc: 'Mujer de 25, cabello negro recogido, piel clara',
  characterEthnicity: 'Latina peruana',
  accent: 'Español peruano de Lima',
  voice: 'Femenina, joven, ritmo conversacional',
  constraints: '',
}

describe('buildValidationMatrix', () => {
  it('marca CONFIRMADA lo que el usuario entregó', () => {
    const m = buildValidationMatrix(FULL, false)
    const producto = m.rows.find((r) => r.variable === 'Producto')!
    expect(producto.estado).toBe('CONFIRMADA')
    expect(producto.fuente).toBe('USUARIO')
    expect(producto.valor).toBe('Serum Eunoia')
  })

  it('marca PENDIENTE lo que falta y usa el literal del spec', () => {
    // ⚠️ El acento salió del wizard (2026-08-25): la voz es un perfil fijo en español.
    // Sin fila, un acento vacío ya no puede trabar la FASE 0.
    const m = buildValidationMatrix({ ...FULL, accent: '' }, false)
    expect(m.rows.some((r) => r.variable.startsWith('Acento'))).toBe(false)
    expect(m.pending).not.toContain('Acento')
  })

  // El spec: "nunca infieras raza/etnia, origen cultural o acento únicamente a
  // partir de la apariencia visual. Deben provenir del usuario."
  it('la etnia NUNCA sale de la referencia, ni con imagen de personaje', () => {
    const m = buildValidationMatrix({ ...FULL, characterEthnicity: '', accent: '' }, true)
    for (const v of ['Raza / etnia / origen cultural']) {
      const row = m.rows.find((r) => r.variable === v)!
      expect(row.estado).toBe('PENDIENTE')
      expect(row.fuente).toBe('USUARIO')
    }
  })

  it('la imagen de personaje confirma la apariencia, no la identidad cultural', () => {
    const m = buildValidationMatrix({ ...FULL, characterDesc: '' }, true)
    const row = m.rows.find((r) => r.variable === 'Personaje')!
    expect(row.estado).toBe('CONFIRMADA')
    expect(row.fuente).toBe('REFERENCIA')
  })

  it('sin imagen ni descripción, el personaje queda pendiente', () => {
    const m = buildValidationMatrix({ ...FULL, characterDesc: '' }, false)
    expect(m.rows.find((r) => r.variable === 'Personaje')!.estado).toBe('PENDIENTE')
  })

  it('la voz es opcional: vacía no bloquea', () => {
    const m = buildValidationMatrix({ ...FULL, voice: '' }, false)
    const row = m.rows.find((r) => r.variable === 'Voz')!
    expect(row.estado).toBe('CONFIRMADA')
    expect(canProceed(m)).toBe(true)
  })
})

describe('canProceed', () => {
  it('deja avanzar cuando todo lo crítico está confirmado', () => {
    expect(canProceed(buildValidationMatrix(FULL, false))).toBe(true)
  })

  it('bloquea con una sola crítica pendiente', () => {
    expect(canProceed(buildValidationMatrix({ ...FULL, angle: '' }, false))).toBe(false)
    expect(canProceed(buildValidationMatrix({ ...FULL, characterEthnicity: '' }, false))).toBe(false)
  })

  it('lista las pendientes para mostrarlas en el wizard', () => {
    const m = buildValidationMatrix({ ...FULL, characterEthnicity: '', problem: '' }, false)
    expect(m.pending.sort()).toEqual(['Problema / deseo', 'Raza / etnia / origen cultural'])
  })
})

// Repro de la revisión (Task 7, fix round 1): `maxReached` del riel es monótono
// creciente, así que completar la matriz una vez, volver a "Personaje", vaciar un
// campo crítico y reenviar dejaba "Plantilla" clickeable en el riel aunque la
// matriz hubiera vuelto a PENDIENTE. `capMaxReached` es el tope que cierra ese hueco.
describe('capMaxReached', () => {
  const OK = buildValidationMatrix(FULL, false)
  const PENDING = buildValidationMatrix({ ...FULL, characterEthnicity: '' }, false)
  const VALIDATION_STEP = 3

  it('con la matriz OK, no topa nada: se puede llegar hasta donde ya se llegó', () => {
    expect(capMaxReached(4, OK, VALIDATION_STEP)).toBe(4)
  })

  it('sin validation todavía (nunca se completó el paso), topa en el gate', () => {
    expect(capMaxReached(4, null, VALIDATION_STEP)).toBe(VALIDATION_STEP)
  })

  it('con una crítica PENDIENTE, topa en el gate aunque ya se hubiera llegado más lejos', () => {
    expect(capMaxReached(4, PENDING, VALIDATION_STEP)).toBe(VALIDATION_STEP)
  })

  it('si nunca se pasó del gate, el tope no cambia nada (Math.min no sube el valor)', () => {
    expect(capMaxReached(1, PENDING, VALIDATION_STEP)).toBe(1)
  })
})

/**
 * ⚠️ CON VARIOS PERSONAJES LA FASE 0 BLOQUEA POR CADA UNO. La etnia es el campo que el
 * spec prohíbe inferir, y que un personaje la tenga no cubre al otro.
 */
describe('buildValidationMatrix — varios personajes', () => {
  const completos = {
    productName: 'Top', productDescription: 'Top asimétrico', angle: 'Nuevo ingreso',
    targetAudience: 'Mujeres 20-30', problem: 'Ropa en tendencia',
    characterDesc: 'x', characterEthnicity: 'x', accent: 'x', voice: '', constraints: '',
  }
  const p = (over: Record<string, unknown> = {}) => ({
    id: 'P1', rol: 'hijo', desc: 'Hombre de 30', etnia: 'Latino mexicano',
    acento: 'Español mexicano', voz: '', fotoUrl: null, ...over,
  })

  it('con dos personajes completos, todo confirmado', () => {
    const m = buildValidationMatrix(
      { ...completos, personajes: [p(), p({ id: 'P2', rol: 'padre' })] } as never, false,
    )
    expect(m.pending).toEqual([])
    expect(m.rows.some((r) => r.variable === 'Raza / etnia / origen cultural · hijo')).toBe(true)
    expect(m.rows.some((r) => r.variable === 'Raza / etnia / origen cultural · padre')).toBe(true)
    expect(m.rows.some((r) => r.variable.startsWith('Acento'))).toBe(false)
  })

  it('si al SEGUNDO le falta la etnia, la FASE 0 lo bloquea y dice de quién', () => {
    const m = buildValidationMatrix(
      { ...completos, personajes: [p(), p({ id: 'P2', rol: 'padre', etnia: '' })] } as never, false,
    )
    expect(m.pending).toContain('Raza / etnia / origen cultural · padre')
    expect(m.pending).not.toContain('Raza / etnia / origen cultural · hijo')
  })

  it('la foto confirma la APARIENCIA de ese personaje, nunca su etnia', () => {
    // Una foto no confirma origen cultural: el spec lo prohíbe explícitamente.
    const m = buildValidationMatrix({
      ...completos,
      personajes: [p({ fotoUrl: 'https://cdn/f.png', desc: '', etnia: '' }), p({ id: 'P2', rol: 'padre' })],
    } as never, false)
    // La apariencia del hijo queda confirmada por su foto…
    expect(m.rows.find((r) => r.variable === 'Personaje · hijo')?.estado).toBe('CONFIRMADA')
    // …pero su etnia sigue pendiente: una foto no confirma origen cultural.
    expect(m.pending).toContain('Raza / etnia / origen cultural · hijo')
    expect(m.pending).not.toContain('Raza / etnia / origen cultural · padre')
  })

  it('con UN solo personaje la matriz es la de siempre — sin sufijos de rol', () => {
    const m = buildValidationMatrix({ ...completos, personajes: [p()] } as never, false)
    expect(m.rows.some((r) => r.variable === 'Raza / etnia / origen cultural')).toBe(true)
    expect(m.rows.some((r) => r.variable.includes('·'))).toBe(false)
  })

  it('sin la lista se comporta exactamente como antes', () => {
    const sinLista = buildValidationMatrix(completos as never, false)
    const conUno = buildValidationMatrix({ ...completos, personajes: [p()] } as never, false)
    expect(sinLista.rows.map((r) => r.variable)).toEqual(conUno.rows.map((r) => r.variable))
  })
})
