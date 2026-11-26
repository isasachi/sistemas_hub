/**
 * Entrar sin contraseña: un enlace al correo (magic link de Supabase).
 *
 * Es el login de las cuentas que nacen sin contraseña (registro Empire de cortesía) y,
 * de paso, la salida de quien olvidó la suya: el hub no tenía "olvidé mi contraseña".
 *
 * ⚠️ `shouldCreateUser: false` SIEMPRE. Este camino solo sirve para ENTRAR: si creara
 * cuentas, sería un registro paralelo que se salta el formulario de /signup.
 *
 * ⚠️ EL ENLACE LO ARMA LA PLANTILLA "MAGIC LINK" DE SUPABASE, NO ESTE CÓDIGO. Apunta a
 * `/auth/confirm?token_hash=…&type=email&next=/dashboard`, que verifica sin cookie y por
 * eso funciona abierto en otro dispositivo. El `emailRedirectTo` de abajo solo se usa
 * si alguien vuelve la plantilla a la de fábrica: ahí el enlace cae en `/auth/callback`
 * por PKCE y solo funciona en el MISMO navegador que lo pidió (el `code_verifier` vive
 * en una cookie de ese navegador). Por eso corre con el cliente de cookies y no con el
 * service role.
 */
import { createClient } from '@/lib/supabase/server'

/** Ruta interna o el dashboard. Evita open-redirect. */
export function rutaSegura(next: string | null | undefined): string {
  const n = String(next ?? '')
  return n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard'
}

/**
 * Origen público del request, para armar la URL de vuelta del correo. Un server action
 * es un POST del navegador, así que trae `origin`; el resto es por si no.
 */
export function origenDe(h: Headers): string {
  const origin = h.get('origin')
  if (origin) return origin
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export type EnvioEnlace = { ok: true } | { ok: false; motivo: 'sin-cuenta' | 'limite' | 'error' }

export async function enviarEnlaceAcceso(email: string, origen: string, next: string): Promise<EnvioEnlace> {
  const supabase = await createClient()
  const vuelta = `${origen}/auth/callback?next=${encodeURIComponent(rutaSegura(next))}`
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: vuelta },
  })
  if (!error) return { ok: true }

  const m = error.message.toLowerCase()
  // Con shouldCreateUser:false, un correo sin cuenta responde "Signups not allowed for otp".
  if (m.includes('signup') || m.includes('not found')) return { ok: false, motivo: 'sin-cuenta' }
  if (m.includes('rate limit') || m.includes('too many') || error.status === 429)
    return { ok: false, motivo: 'limite' }
  console.error('[enlace-acceso]', error.message)
  return { ok: false, motivo: 'error' }
}
