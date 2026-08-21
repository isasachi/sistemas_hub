import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { Webhook } from 'standardwebhooks'
import { grantsAccess, isGrandfathered, entitlementFromEvent, webhookKey } from './whop'

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
      metadata: { supabase_user_id: 'uuid-del-usuario', tier: '2' },
      ...over,
    },
  }
}

describe('grantsAccess', () => {
  // Hoy los planes no tienen prueba gratis, pero la rama se queda: durante una prueba
  // no hay `payment.succeeded`, así que si `trialing` no diera acceso, habilitar una
  // prueba en Whop (una casilla, cero código) dejaría afuera a quien acaba de entrar.
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

  // El valor EXACTO que está cargado en Vercel (production y preview, 2026-08-20).
  // Va como test y no como comentario porque es la única forma de comprobar el
  // formato: la variable es sensitive en Vercel y no se puede volver a leer. Si
  // alguien cambia el separador o mete espacios, se cae acá y no en producción con
  // los tres usuarios afuera.
  it('parsea el valor real de producción', () => {
    vi.stubEnv('WHOP_GRANDFATHERED_EMAILS', 'demo1@jrhub.pe,demo2@jrhub.pe,demo3@jrhub.pe')
    for (const e of ['demo1@jrhub.pe', 'demo2@jrhub.pe', 'demo3@jrhub.pe']) {
      expect(isGrandfathered(e)).toBe(true)
    }
    expect(isGrandfathered('demo4@jrhub.pe')).toBe(false)
  })
})

describe('entitlementFromEvent', () => {
  it('mapea un membership.activated completo', () => {
    expect(entitlementFromEvent(evento())).toEqual({
      whop_membership_id: 'mem_abc123',
      user_id: 'uuid-del-usuario',
      status: 'trialing',
      tier: 2,
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

  // El tier viaja por el MISMO mecanismo que el user_id (metadata heredada de la
  // checkout configuration), así que no agrega ninguna suposición sobre la forma
  // del sobre: si uno llega, el otro también.
  it('toma el tier del metadata', () => {
    expect(entitlementFromEvent(evento({ metadata: { supabase_user_id: 'u', tier: '3' } }))?.tier)
      .toBe(3)
  })

  it('cae al plan_id cuando el metadata no trae tier', () => {
    vi.stubEnv('WHOP_PLAN_ID_2', 'plan_dos')
    const e = evento({ metadata: { supabase_user_id: 'u' }, plan_id: 'plan_dos' })
    expect(entitlementFromEvent(e)?.tier).toBe(2)
  })

  // ⚠️ Equivocarse hacia ARRIBA regala el plan caro y nadie reclama; hacia abajo es
  // un ticket visible. El fallback tiene que ser el plan más bajo.
  it.each([
    ['metadata basura', { supabase_user_id: 'u', tier: 'oro' }],
    ['sin tier ni plan conocido', { supabase_user_id: 'u' }],
    ['tier fuera de rango', { supabase_user_id: 'u', tier: '9' }],
  ])('%s: cae al plan 1, nunca al más alto', (_caso, metadata) => {
    expect(entitlementFromEvent(evento({ metadata, plan_id: 'plan_desconocido' }))?.tier).toBe(1)
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
      // Sin esto la ruta llama a Whop y a Supabase de verdad y el test se cuelga.
      cancelPreviousMemberships: async () => {},
    }))
    return (await import('@/app/api/whop/webhook/route')).POST
  }

  // ⚠️ EL CAMBIO DE PLAN AUTOMÁTICO SE DISPARA ACÁ. Si esta llamada no ocurre, el
  // usuario que cambia de plan queda pagando DOS suscripciones — y la pantalla ya
  // no le avisa que cancele la vieja, porque se supone que lo hacemos nosotros.
  it('cancela el plan anterior después de guardar', async () => {
    const cancelados: Array<[string, string]> = []
    vi.doMock('@/lib/whop', async (orig) => ({
      ...(await orig<typeof import('./whop')>()),
      saveEntitlement: async () => {},
      cancelPreviousMemberships: async (u: string, keep: string) => void cancelados.push([u, keep]),
    }))
    const { POST } = await import('@/app/api/whop/webhook/route')
    await POST(firmado(JSON.stringify(evento())))

    expect(cancelados).toEqual([['uuid-del-usuario', 'mem_abc123']])
  })

  // Un `deactivated` no puede arrastrarse al resto de las memberships del usuario.
  it('un evento que NO da acceso no cancela nada', async () => {
    const cancelados: string[] = []
    vi.doMock('@/lib/whop', async (orig) => ({
      ...(await orig<typeof import('./whop')>()),
      saveEntitlement: async () => {},
      cancelPreviousMemberships: async (_u: string, keep: string) => void cancelados.push(keep),
    }))
    const { POST } = await import('@/app/api/whop/webhook/route')
    await POST(firmado(JSON.stringify(evento({ status: 'expired' }))))

    expect(cancelados).toEqual([])
  })

  // ⚠️ Best-effort. Un 500 haría que Whop reintente ~3 días y vuelva a correr TODO
  // el handler por algo que YA quedó guardado; el peor caso de no cancelar es un
  // cobro de más que se arregla a mano, bastante mejor que el endpoint desactivado.
  it('si la cancelación falla, igual responde 200', async () => {
    vi.doMock('@/lib/whop', async (orig) => ({
      ...(await orig<typeof import('./whop')>()),
      saveEntitlement: async () => {},
      cancelPreviousMemberships: async () => { throw new Error('whop caído') },
    }))
    const { POST } = await import('@/app/api/whop/webhook/route')
    const res = await POST(firmado(JSON.stringify(evento())))

    expect(res.status).toBe(200)
  })

  it('acepta una firma válida y guarda el entitlement', async () => {
    const POST = await rutaConDbFalsa()
    const res = await POST(firmado(JSON.stringify(evento())))

    expect(res.status).toBe(200)
    expect(guardadas).toHaveLength(1)
    expect(guardadas[0]).toMatchObject({
      whop_membership_id: 'mem_abc123', status: 'trialing', tier: 2,
    })
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

/**
 * ⚠️ EL SECRET REAL DE WHOP EMPIEZA CON `ws_`, NO CON `whsec_`, Y ESO ROMPÍA LA
 * VERIFICACIÓN ENTERA.
 *
 * Los tests de arriba firman con `new Webhook(SECRET)`, o sea con la MISMA librería
 * que verifica y con un secreto base64 inventado — la misma trampa que este proyecto
 * ya documentó para el sobre del webhook: construir el caso con la suposición que se
 * quiere probar. Con el secreto real (`ws_…`, medido el 2026-08-21) el constructor
 * lanza `Base64Coder: incorrect characters for decoding` y la ruta devuelve 401 a
 * TODO evento, en silencio.
 *
 * Acá la firma se arma como la documenta Whop y sin usar la librería: HMAC-SHA256
 * sobre `{id}.{timestamp}.{cuerpo}` con la clave = los bytes literales del `ws_…`,
 * en base64, en el header `webhook-signature` como `v1,<firma>`.
 */
describe('firma con el secret real de Whop (ws_…)', () => {
  const WS = 'ws_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4'

  // Solo se convierte el formato de Whop: un secreto que la librería ya entiende
  // (con prefijo o base64 pelado) tiene que pasar intacto, o se rompería.
  it('webhookKey convierte un ws_ y no toca ningún otro formato', () => {
    expect(webhookKey(WS)).toBe(`whsec_${Buffer.from(WS, 'utf8').toString('base64')}`)
    expect(webhookKey('whsec_abc')).toBe('whsec_abc')
    expect(webhookKey(SECRET)).toBe(SECRET)
  })

  it('la ruta acepta un evento firmado como firma Whop de verdad', async () => {
    vi.resetModules()
    vi.stubEnv('WHOP_WEBHOOK_SECRET', WS)
    const guardadas: unknown[] = []
    vi.doMock('@/lib/whop', async (orig) => ({
      ...(await orig<typeof import('./whop')>()),
      saveEntitlement: async (row: unknown) => void guardadas.push(row),
      cancelPreviousMemberships: async () => {},
    }))
    const { POST } = await import('@/app/api/whop/webhook/route')

    const body = JSON.stringify(evento())
    const id = 'msg_real'
    const ts = Math.floor(Date.now() / 1000).toString()
    const firma = createHmac('sha256', Buffer.from(WS, 'utf8'))
      .update(`${id}.${ts}.${body}`)
      .digest('base64')

    const res = await POST(new Request('https://hub.test/api/whop/webhook', {
      method: 'POST',
      headers: {
        'webhook-id': id,
        'webhook-timestamp': ts,
        'webhook-signature': `v1,${firma}`,
      },
      body,
    }))

    expect(res.status).toBe(200)
    expect(guardadas).toHaveLength(1)
  })
})
