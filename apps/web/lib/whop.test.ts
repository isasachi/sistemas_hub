import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Webhook } from 'standardwebhooks'
import { grantsAccess, isGrandfathered, entitlementFromEvent } from './whop'

// Secreto de juguete en el formato que pide Standard Webhooks (base64).
const SECRET = Buffer.from('secreto-de-prueba-para-firmar-webhooks').toString('base64')

/** Payload con la forma real de un membership.activated de Whop. */
function evento(over: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    type: 'membership.activated',
    data: {
      id: 'mem_abc123',
      status: 'trialing',
      renewal_period_end: '2026-08-22T00:00:00Z',
      metadata: { supabase_user_id: 'uuid-del-usuario' },
      ...over,
    },
  }
}

describe('grantsAccess', () => {
  // El bug que este proyecto tiene que evitar: el plan lleva 3 días de prueba, así
  // que si `trialing` no diera acceso el usuario quedaría afuera justo en la prueba.
  it('trialing da acceso', () => {
    expect(grantsAccess('trialing')).toBe(true)
  })

  it('canceling da acceso: el período pagado sigue corriendo', () => {
    expect(grantsAccess('canceling')).toBe(true)
  })

  it.each(['past_due', 'canceled', 'expired', 'completed', 'unresolved', 'drafted'])(
    '%s no da acceso',
    (status) => {
      expect(grantsAccess(status)).toBe(false)
    },
  )
})

describe('isGrandfathered', () => {
  beforeEach(() => {
    vi.stubEnv('WHOP_GRANDFATHERED_EMAILS', 'uno@jrhub.pe, DOS@jrhub.pe')
  })

  it('reconoce el email sin importar mayúsculas ni espacios', () => {
    expect(isGrandfathered('dos@jrhub.pe')).toBe(true)
    expect(isGrandfathered('uno@jrhub.pe')).toBe(true)
  })

  it('rechaza a cualquier otro, y no explota sin email', () => {
    expect(isGrandfathered('tres@jrhub.pe')).toBe(false)
    expect(isGrandfathered(null)).toBe(false)
  })
})

describe('entitlementFromEvent', () => {
  it('mapea un membership.activated completo', () => {
    expect(entitlementFromEvent(evento())).toEqual({
      whop_membership_id: 'mem_abc123',
      user_id: 'uuid-del-usuario',
      status: 'trialing',
      renewal_period_end: '2026-08-22T00:00:00Z',
    })
  })

  // El estado sale del payload, nunca del nombre del evento: un "activated" de una
  // membership past_due no puede otorgar acceso por llamarse activated.
  it('toma el status del payload, no del tipo de evento', () => {
    expect(entitlementFromEvent(evento({ status: 'past_due' }))?.status).toBe('past_due')
  })

  it('ignora eventos que no son de membership', () => {
    expect(entitlementFromEvent({ type: 'payment.succeeded', data: { id: 'pay_1' } })).toBeNull()
  })

  // Sin el user_id no sabemos de quién es el pago: mejor descartar que escribir una
  // fila a medias que después nadie puede atribuir.
  it('descarta el evento si falta el supabase_user_id', () => {
    expect(entitlementFromEvent(evento({ metadata: {} }))).toBeNull()
  })

  it('tolera que no venga renewal_period_end', () => {
    expect(entitlementFromEvent(evento({ renewal_period_end: undefined }))?.renewal_period_end)
      .toBeNull()
  })
})

describe('POST /api/whop/webhook', () => {
  const guardadas: unknown[] = []

  beforeEach(() => {
    guardadas.length = 0
    vi.resetModules()
    vi.stubEnv('WHOP_WEBHOOK_SECRET', SECRET)
  })

  /** Arma un Request firmado de verdad, con la misma librería que verifica la ruta. */
  function firmado(body: string, { adulterar = false } = {}) {
    const id = 'msg_1'
    const ts = new Date()
    const signature = new Webhook(SECRET).sign(id, ts, body)
    return new Request('https://hub.test/api/whop/webhook', {
      method: 'POST',
      headers: {
        'webhook-id': id,
        'webhook-timestamp': Math.floor(ts.getTime() / 1000).toString(),
        'webhook-signature': signature,
      },
      body: adulterar ? body.replace('trialing', 'active') : body,
    })
  }

  async function rutaConDbFalsa() {
    vi.doMock('@/lib/whop', async (orig) => ({
      ...(await orig<typeof import('./whop')>()),
      saveEntitlement: async (row: unknown) => void guardadas.push(row),
    }))
    return (await import('@/app/api/whop/webhook/route')).POST
  }

  it('acepta una firma válida y guarda el entitlement', async () => {
    const POST = await rutaConDbFalsa()
    const res = await POST(firmado(JSON.stringify(evento())))

    expect(res.status).toBe(200)
    expect(guardadas).toHaveLength(1)
    expect(guardadas[0]).toMatchObject({ whop_membership_id: 'mem_abc123', status: 'trialing' })
  })

  // El cuerpo se firma crudo: cambiar un byte después de firmar tiene que fallar.
  // Sin esto, cualquiera podría POSTear un membership activo y regalarse la suscripción.
  it('rechaza un cuerpo adulterado', async () => {
    const POST = await rutaConDbFalsa()
    const res = await POST(firmado(JSON.stringify(evento()), { adulterar: true }))

    expect(res.status).toBe(401)
    expect(guardadas).toHaveLength(0)
  })

  it('rechaza si no viene firma', async () => {
    const POST = await rutaConDbFalsa()
    const res = await POST(
      new Request('https://hub.test/api/whop/webhook', { method: 'POST', body: '{}' }),
    )
    expect(res.status).toBe(401)
  })

  // Un evento que no nos toca igual se responde 2xx: un no-2xx hace que Whop reintente
  // ~3 días y termine desactivando el endpoint.
  it('acusa recibo 200 de un evento que no maneja', async () => {
    const POST = await rutaConDbFalsa()
    const body = JSON.stringify({ id: 'evt_2', type: 'payment.pending', data: { id: 'pay_1' } })
    const res = await POST(firmado(body))

    expect(res.status).toBe(200)
    expect(guardadas).toHaveLength(0)
  })
})
