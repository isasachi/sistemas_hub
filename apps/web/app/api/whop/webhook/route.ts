import { Webhook } from 'standardwebhooks'
import {
  cancelPreviousMemberships,
  entitlementFromEvent,
  grantsAccess,
  saveEntitlement,
  webhookKey,
} from '@/lib/whop'

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

  // Cambio de plan automático. Whop no tiene endpoint para mover una membership de
  // plan, así que contratar otro crea una suscripción NUEVA y la vieja seguiría
  // cobrando: se cancela acá.
  //
  // ⚠️ DESPUÉS de guardar y solo si la nueva DA acceso. Cancelar antes de que el
  // pago esté confirmado dejaría al usuario sin ningún plan; y un `deactivated` no
  // puede arrastrarse al resto de sus memberships.
  //
  // ⚠️ Best-effort: un fallo se loguea y la respuesta sigue siendo 200. Devolver
  // 500 haría que Whop reintente ~3 días y vuelva a correr TODO el handler por algo
  // que ya quedó guardado, y el peor caso de no cancelar es un cobro de más que se
  // arregla a mano — bastante mejor que un endpoint desactivado.
  if (grantsAccess(row.status)) {
    try {
      await cancelPreviousMemberships(row.user_id, row.whop_membership_id)
    } catch (err) {
      console.error(
        '[whop] no se pudo cancelar el plan anterior:',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  return new Response('ok', { status: 200 })
}
