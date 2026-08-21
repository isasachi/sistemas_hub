import { Webhook } from 'standardwebhooks'
import { entitlementFromEvent, saveEntitlement, webhookKey } from '@/lib/whop'

/**
 * Webhook de Whop — la ÚNICA escritura de `user_entitlements`.
 *
 * ⚠️ Esta ruta tiene que quedar FUERA del gate de auth, y hoy lo está gratis: el
 * matcher de `proxy.ts` excluye `/api/*`. Si alguien "arregla" ese matcher para cubrir
 * las rutas de API, tiene que dejar `/api/whop/webhook` afuera explícitamente — Whop
 * llama sin cookie de sesión y un redirect a /login le devolvería un no-2xx.
 *
 * ⚠️ La firma se calcula sobre el CUERPO CRUDO. `req.text()`, nunca `req.json()`:
 * volver a serializar cambia bytes (orden de claves, espacios) y la verificación falla.
 */
export const runtime = 'nodejs' // standardwebhooks usa node:crypto

export async function POST(req: Request) {
  const secret = process.env.WHOP_WEBHOOK_SECRET
  if (!secret) {
    console.error('[whop] falta WHOP_WEBHOOK_SECRET')
    return new Response('no configurado', { status: 500 })
  }

  const body = await req.text()
  const headers = Object.fromEntries(req.headers)

  let evt: unknown
  try {
    // Verifica firma HMAC y ventana de tiempo (Standard Webhooks). Lanza si no cuadra.
    evt = new Webhook(webhookKey(secret)).verify(body, headers)
  } catch (err) {
    console.error('[whop] firma inválida:', err instanceof Error ? err.message : String(err))
    return new Response('firma inválida', { status: 401 })
  }

  const row = entitlementFromEvent(evt)
  // Evento que no nos toca (o incompleto): se acusa recibo igual. Un no-2xx haría que
  // Whop lo reintente ~3 días y termine desactivando el endpoint.
  if (!row) return new Response('ok', { status: 200 })

  try {
    await saveEntitlement(row)
  } catch (err) {
    // Acá SÍ conviene el reintento: el evento era bueno y la escritura falló.
    console.error('[whop]', err instanceof Error ? err.message : String(err))
    return new Response('error al guardar', { status: 500 })
  }

  return new Response('ok', { status: 200 })
}
