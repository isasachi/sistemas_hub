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
    const m = buildValidationMatrix({ ...FULL, accent: '' }, false)
    const acento = m.rows.find((r) => r.variable === 'Acento')!
    expect(acento.estado).toBe('PENDIENTE')
    expect(acento.valor).toBe(`${CONFIRMACION_REQUERIDA} Acento`)
  })

  // El spec: "nunca infieras raza/etnia, origen cultural o acento únicamente a
  // partir de la apariencia visual. Deben provenir del usuario."
  it('etnia y acento NUNCA salen de la referencia, ni con imagen de personaje', () => {
    const m = buildValidationMatrix({ ...FULL, characterEthnicity: '', accent: '' }, true)
    for (const v of ['Raza / etnia / origen cultural', 'Acento']) {
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
    expect(canProceed(buildValidationMatrix({ ...FULL, accent: '' }, false))).toBe(false)
  })

  it('lista las pendientes para mostrarlas en el wizard', () => {
    const m = buildValidationMatrix({ ...FULL, accent: '', problem: '' }, false)
    expect(m.pending.sort()).toEqual(['Acento', 'Problema / deseo'])
  })
})

// Repro de la revisión (Task 7, fix round 1): `maxReached` del riel es monótono
// creciente, así que completar la matriz una vez, volver a "Personaje", vaciar un
// campo crítico y reenviar dejaba "Plantilla" clickeable en el riel aunque la
// matriz hubiera vuelto a PENDIENTE. `capMaxReached` es el tope que cierra ese hueco.
describe('capMaxReached', () => {
  const OK = buildValidationMatrix(FULL, false)
  const PENDING = buildValidationMatrix({ ...FULL, accent: '' }, false)
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
