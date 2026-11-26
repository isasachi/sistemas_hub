import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { rutaSegura } from '@/lib/enlace-acceso'

const TIPOS: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']

/**
 * Verifica un enlace del correo por `token_hash` (no por `?code=`).
 *
 * Existe porque `/auth/callback` canjea un `?code=` PKCE, y eso exige la cookie con el
 * `code_verifier` del navegador que pidió el enlace: abrir el correo en el celular
 * después de pedirlo en la laptop falla. `verifyOtp` con el hash no necesita cookie.
 *
 * ⚠️ SOLO SE USA SI LA PLANTILLA DE CORREO DE SUPABASE APUNTA ACÁ. Con la plantilla por
 * defecto el enlace va a `/auth/callback` y esta ruta no recibe nada. Plantilla "Magic
 * Link" (Authentication → Email Templates):
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = rutaSegura(searchParams.get('next'))

  if (tokenHash && type && TIPOS.includes(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=enlace`)
}
