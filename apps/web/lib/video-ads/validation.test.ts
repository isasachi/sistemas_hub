import { describe, it, expect } from 'vitest'
import { buildValidationMatrix, canProceed, capMaxReached, CONFIRMACION_REQUERIDA } from './validation'
import type { UserInputs } from './types'

const FULL: UserInputs = {
  productName: 'Serum Eunoia',
  productDescription: 'Suero de niacinamida para marcas de acné',
  angle: 'Testimonio de resultados en 4 semanas',
  targetAudience: 'Mujeres 20-35 con piel grasa',
  problem: 'Marcas de acné que no se van',
  // Los cuatro campos de abajo ya no se le piden al usuario ni se leen: el personaje
  // sale de la foto, la etnia de ahí mismo sin declararla, el acento lo infiere la
  // FASE 4 y la voz es uno de los cuatro perfiles fijos. Quedan en el tipo porque sus
  // columnas siguen en la tabla (precedente de `ph_user_seen`).
  characterDesc: '',
  characterEthnicity: '',
  accent: '',
  voice: '',
  constraints: '',
}

// El segundo argumento es "¿hay foto del personaje?", y sin ella la matriz NO deja
// pasar: por eso el caso completo la trae puesta.
const CON_FOTO = true

describe('buildValidationMatrix', () => {
  it('marca CONFIRMADA lo que el usuario entregó', () => {
    const m = buildValidationMatrix(FULL, CON_FOTO)
    const producto = m.rows.find((r) => r.variable === 'Producto')!
    expect(producto.estado).toBe('CONFIRMADA')
    expect(producto.fuente).toBe('USUARIO')
    expect(producto.valor).toBe('Serum Eunoia')
  })

  it('marca PENDIENTE lo que falta y usa el literal del spec', () => {
    const m = buildValidationMatrix({ ...FULL, angle: '' }, CON_FOTO)
    const angulo = m.rows.find((r) => r.variable === 'Ángulo')!
    expect(angulo.estado).toBe('PENDIENTE')
    expect(angulo.valor).toBe(`${CONFIRMACION_REQUERIDA} Ángulo`)
  })

  // Son SEIS y ninguna más: etnia, acento y voz salieron de la matriz porque salieron
  // del wizard. Este test es el que se entera si alguna vuelve a colarse.
  it('valida exactamente las seis variables, sin etnia, acento ni voz', () => {
    const m = buildValidationMatrix(FULL, CON_FOTO)
    expect(m.rows.map((r) => r.variable)).toEqual([
      'Producto', 'Descripción del producto', 'Ángulo', 'Público objetivo',
      'Problema / deseo', 'Personaje',
    ])
  })

  it('la foto es la ÚNICA fuente del personaje', () => {
    const m = buildValidationMatrix(FULL, CON_FOTO)
    const row = m.rows.find((r) => r.variable === 'Personaje')!
    expect(row.estado).toBe('CONFIRMADA')
    expect(row.fuente).toBe('REFERENCIA')
  })

  // El personaje nunca se infiere, así que una descripción escrita no lo confirma:
  // sin foto el flujo se detiene aunque todo lo demás esté completo.
  it('sin foto el personaje queda pendiente y NO se avanza', () => {
    const m = buildValidationMatrix({ ...FULL, characterDesc: 'Mujer de 25, pelo negro' }, false)
    expect(m.rows.find((r) => r.variable === 'Personaje')!.estado).toBe('PENDIENTE')
    expect(canProceed(m)).toBe(false)
  })
})

describe('canProceed', () => {
  it('deja avanzar cuando todo lo crítico está confirmado', () => {
    expect(canProceed(buildValidationMatrix(FULL, CON_FOTO))).toBe(true)
  })

  it('bloquea con una sola crítica pendiente', () => {
    expect(canProceed(buildValidationMatrix({ ...FULL, angle: '' }, CON_FOTO))).toBe(false)
    expect(canProceed(buildValidationMatrix(FULL, false))).toBe(false)
  })

  it('lista las pendientes para mostrarlas en el wizard', () => {
    const m = buildValidationMatrix({ ...FULL, problem: '' }, false)
    expect(m.pending.sort()).toEqual(['Personaje', 'Problema / deseo'])
  })
})

// Repro de la revisión (Task 7, fix round 1): `maxReached` del riel es monótono
// creciente, así que completar la matriz una vez, volver a "Personaje", vaciar un
// campo crítico y reenviar dejaba "Plantilla" clickeable en el riel aunque la
// matriz hubiera vuelto a PENDIENTE. `capMaxReached` es el tope que cierra ese hueco.
describe('capMaxReached', () => {
  const OK = buildValidationMatrix(FULL, CON_FOTO)
  const PENDING = buildValidationMatrix({ ...FULL, angle: '' }, CON_FOTO)
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
