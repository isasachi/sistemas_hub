'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { enviarEnlaceAcceso, origenDe } from '@/lib/enlace-acceso'

export type AuthState = {
  error?: string
  fieldErrors?: { email?: string; password?: string }
  notice?: string
}

const emailSchema = z.email({ error: 'Ingresa un email válido.' })
const passwordSchema = z
  .string()
  .min(8, { error: 'La contraseña debe tener al menos 8 caracteres.' })

function parse(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/dashboard') || '/dashboard'

  const fieldErrors: AuthState['fieldErrors'] = {}
  const emailCheck = emailSchema.safeParse(email)
  if (!emailCheck.success) fieldErrors.email = emailCheck.error.issues[0].message
  const pwCheck = passwordSchema.safeParse(password)
  if (!pwCheck.success) fieldErrors.password = pwCheck.error.issues[0].message

  return { email, password, next, fieldErrors }
}

/**
 * Traduce el error de Supabase (siempre en inglés) al español del hub.
 * Sin `export`: en un módulo 'use server' solo pueden exportarse funciones async.
 */
function signUpError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('already exists'))
    return 'Ese email ya tiene una cuenta. Inicia sesión o usa otro.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.'
  if (m.includes('password'))
    return 'La contraseña no cumple los requisitos. Usa al menos 8 caracteres.'
  if (m.includes('email'))
    return 'Ese email no es válido. Revísalo e inténtalo de nuevo.'
  return 'No se pudo crear la cuenta. Inténtalo de nuevo en un momento.'
}

// `next` debe ser una ruta interna; evita open-redirect.
function safeNext(next: string) {
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, next, fieldErrors } = parse(formData)
  if (fieldErrors.email || fieldErrors.password) return { fieldErrors }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: 'Credenciales incorrectas. Revisa los datos o crea una cuenta.' }
  }

  redirect(safeNext(next))
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, next, fieldErrors } = parse(formData)
  if (fieldErrors.email || fieldErrors.password) return { fieldErrors }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    // Supabase responde en inglés ("User already registered", "Email rate limit
    // exceeded"…) y ese texto se pintaba tal cual en el formulario. Se traducen
    // los casos que el usuario puede resolver y el resto cae a un genérico.
    return { error: signUpError(error.message) }
  }

  // Si la confirmación por email está activa, no hay sesión todavía.
  if (!data.session) {
    return {
      notice: 'Cuenta creada. Revisa tu email para confirmar la cuenta y luego inicia sesión.',
    }
  }

  redirect(safeNext(next))
}

/**
 * Entrar sin contraseña: manda un enlace al correo (lib/enlace-acceso.ts). Es el único
 * login de las cuentas Empire de cortesía, que nacen sin contraseña, y la salida de
 * quien olvidó la suya.
 *
 * ⚠️ "Sin cuenta" responde lo MISMO que el éxito: este botón no puede ser un oráculo
 * para preguntar qué correos están registrados.
 */
export async function sendLoginLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const next = String(formData.get('next') ?? '/dashboard') || '/dashboard'
  const emailCheck = emailSchema.safeParse(email)
  if (!emailCheck.success) return { fieldErrors: { email: emailCheck.error.issues[0].message } }

  const envio = await enviarEnlaceAcceso(email, origenDe(await headers()), safeNext(next))
  if (envio.ok || envio.motivo === 'sin-cuenta') {
    return {
      notice: `Si ${email} tiene una cuenta, te llegará un enlace para entrar. Vence en 1 hora.`,
    }
  }
  if (envio.motivo === 'limite')
    return { error: 'Ya pediste varios enlaces seguidos. Espera unos minutos y vuelve a probar.' }
  return { error: 'No pudimos enviar el enlace. Inténtalo de nuevo en un momento.' }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
