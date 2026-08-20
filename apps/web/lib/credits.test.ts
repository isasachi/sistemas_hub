import { describe, expect, it } from 'vitest'
import { PLANS, TIERS, RAW_BUCKETS, lockedBuckets, unlocksBucket, toTier } from '@ph/shared'
import { isCreditKind, periodStart, periodStartDay, CREDIT_KINDS } from './credits'
import { IMAGE_KINDS } from './gen-quota'

describe('planes', () => {
  // Lo que se vendió: 29/69/89, con 10/20/50 productos y 30/100/180 imágenes.
  it('los tres planes son los acordados', () => {
    expect(TIERS.map((t) => [PLANS[t].precio, PLANS[t].porRango, PLANS[t].creditos])).toEqual([
      [29, 10, 30],
      [69, 20, 100],
      [89, 50, 180],
    ])
  })

  // Acumulativo: el plan 2 incluye lo del 1, el 3 incluye todo. Sin esto, subir de
  // plan podría QUITAR un rango.
  it('los rangos son acumulativos y el plan 3 los tiene todos', () => {
    expect(PLANS[1].buckets).toEqual(['0-50'])
    expect(PLANS[2].buckets).toEqual(['0-50', '50-100'])
    expect(PLANS[3].buckets).toEqual([...RAW_BUCKETS])
    for (const b of PLANS[1].buckets) expect(unlocksBucket(2, b)).toBe(true)
    for (const b of PLANS[2].buckets) expect(unlocksBucket(3, b)).toBe(true)
  })

  it('lockedBuckets es el complemento exacto', () => {
    expect(lockedBuckets(1)).toEqual(['50-100', '100+'])
    expect(lockedBuckets(2)).toEqual(['100+'])
    expect(lockedBuckets(3)).toEqual([])
  })

  // El fallback siempre al plan más bajo: hacia arriba se regala el plan caro.
  it.each([['0', 1], ['4', 1], ['abc', 1], [null, 1], ['2', 2], [3, 3]] as const)(
    'toTier(%s) = %i', (v, esperado) => expect(toTier(v)).toBe(esperado),
  )
})

describe('CREDIT_KINDS', () => {
  it.each(['branding-logo', 'anuncios-image', 'landing-section:hero'])(
    '%s gasta un crédito', (k) => expect(isCreditKind(k)).toBe(true),
  )

  // ⚠️ EL INVARIANTE QUE MÁS IMPORTA. `IMAGE_KINDS` (el cap per-step) incluye los
  // kinds de video porque son igual de caros; los créditos NO, porque el video lo
  // paga el usuario con su propia key de KIE y viene incluido en los tres planes.
  // Reusar una lista para las dos cosas es cómo el video se come las imágenes que
  // se vendieron para anuncios, branding y landing.
  it.each(['video-character', 'video-generation', 'video-forensic'])(
    '%s NO gasta créditos aunque esté en IMAGE_KINDS', (k) => {
      expect(IMAGE_KINDS).toContain(k)
      expect(isCreditKind(k)).toBe(false)
    },
  )

  it('los kinds de texto tampoco gastan', () => {
    expect(isCreditKind('landing-copy')).toBe(false)
    expect(isCreditKind('anuncios-copy')).toBe(false)
  })

  // Si alguien agrega un kind de imagen nuevo a IMAGE_KINDS, este test no lo obliga
  // a agregarlo acá — pero deja escrito que las dos listas son distintas a propósito.
  it('todo CREDIT_KIND es también un IMAGE_KIND', () => {
    for (const k of CREDIT_KINDS) expect(IMAGE_KINDS).toContain(k)
  })
})

describe('periodStart', () => {
  const d = (s: string) => new Date(s)

  // Anclado al día de la renovación, no al 1 del mes: quien se suscribe el 28
  // recibiría créditos el 28 y otra tanda el 1, o sea dos meses por un pago.
  it('ancla en el día del mes de la renovación', () => {
    expect(periodStart('2026-09-28T00:00:00Z', d('2026-09-05T10:00:00Z')).toISOString())
      .toBe('2026-08-28T00:00:00.000Z')
    expect(periodStart('2026-09-28T00:00:00Z', d('2026-09-29T10:00:00Z')).toISOString())
      .toBe('2026-09-28T00:00:00.000Z')
  })

  // Se calcula desde el DÍA DEL MES y no restándole un mes a la fecha guardada, para
  // que una `renewal_period_end` vencida (webhook de renovación demorado) no abra una
  // ventana infinita en la que el usuario nunca vuelve a recibir créditos.
  it('se auto-corrige con una fecha de renovación vencida', () => {
    const inicio = periodStart('2026-03-15T00:00:00Z', d('2026-09-20T00:00:00Z'))
    expect(inicio.toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })

  it('un ancla que no existe en el mes se recorta al último día', () => {
    // El 20 de febrero el período vigente todavía es el que abrió el 31 de enero.
    expect(periodStart('2026-01-31T00:00:00Z', d('2026-02-20T00:00:00Z')).toISOString())
      .toBe('2026-01-31T00:00:00.000Z')
    // El 1 de marzo ya abrió el de febrero, que se recorta al 28 (no existe el 31).
    expect(periodStart('2026-01-31T00:00:00Z', d('2026-03-01T00:00:00Z')).toISOString())
      .toBe('2026-02-28T00:00:00.000Z')
  })

  it('cruza el año hacia atrás sin romperse', () => {
    expect(periodStart('2026-06-20T00:00:00Z', d('2027-01-05T00:00:00Z')).toISOString())
      .toBe('2026-12-20T00:00:00.000Z')
  })

  // Grandfathered: sin fecha de renovación, el ancla es el día 1.
  it('sin renovación ancla el día 1', () => {
    expect(periodStart(null, d('2026-09-17T00:00:00Z')).toISOString())
      .toBe('2026-09-01T00:00:00.000Z')
  })

  // El piso existe para que el primer período no arranque con los créditos ya
  // gastados por el historial previo al lanzamiento (los grandfathered arrastran
  // meses de ph_gen_usage).
  it('nunca cuenta antes del EPOCH', () => {
    expect(periodStartDay(null, d('2026-08-25T00:00:00Z'))).toBe('2026-08-20')
    expect(periodStartDay(null, d('2026-10-05T00:00:00Z'))).toBe('2026-10-01')
  })
})
