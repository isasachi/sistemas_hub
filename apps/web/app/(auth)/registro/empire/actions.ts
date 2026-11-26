'use server'

/**
 * Registro free a Legacy Empire de cortesía (ver lib/cortesia-empire.ts).
 *
 * ⚠️ SERVER ACTIONS Y NO UNA RUTA DE `/api/*`, por la misma regla que el panel admin:
 * `/api/*` no pasa por ningún gate, y un endpoint que otorga plan tiene que ser lo más
 * chico posible. Y ⚠️ EL CÓDIGO SE VALIDA ACÁ DE NUEVO, no solo en la página: un action
 * es un endpoint público, se puede llamar sin haber pasado por la pantalla que lo pinta.
 */
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/server'
import { codigoEmpireValido, crearCuentaEmpire, TIER_EMPIRE } from '@/lib/cortesia-empire'
import { otorgarCortesia } from '@/lib/admin'
import { enviarEnlaceAcceso, origenDe } from '@/lib/enlace-acceso'

export type RegistroState = {
  error?: string
  /** El correo ya tenía cuenta: la página ofrece iniciar sesión y volver a este link. */
  existe?: boolean
  /** Cuenta creada; dice a qué correo se mandó el enlace. */
  enviado?: string
}

const CODIGO_INVALIDO = 'Este enlace de invitación no es válido o ya no está vigente.'
const emailSchema = z.email({ error: 'Ingresa un email válido.' })

export async function registrarEmpire(_prev: RegistroState, fd: FormData): Promise<RegistroState> {
  if (!codigoEmpireValido(String(fd.get('codigo') ?? ''))) return { error: CODIGO_INVALIDO }

  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  const check = emailSchema.safeParse(email)
  if (!check.success) return { error: check.error.issues[0].message }

  const cuenta = await crearCuentaEmpire(email)
  if (!cuenta.ok) {
    if (cuenta.motivo === 'existe') return { existe: true }
    return { error: 'No pudimos crear tu cuenta. Inténtalo de nuevo en un momento.' }
  }

  // La cuenta y el plan ya existen: si el correo falla, NO es un error de registro. El
  // usuario pide otro enlace desde /login y entra igual.
  const envio = await enviarEnlaceAcceso(email, origenDe(await headers()), '/dashboard')
  if (!envio.ok) {
    return {
      error:
        'Tu cuenta con Legacy Empire ya está creada, pero no pudimos enviarte el correo ' +
        'para entrar. Ve a Iniciar sesión y pide un enlace a tu correo en unos minutos.',
    }
  }
  return { enviado: email }
}

/**
 * Activa Empire en la cuenta YA LOGUEADA. La identidad sale de la sesión, nunca del
 * formulario: si viniera del cliente, cualquiera con el código le regalaría el plan a
 * otra cuenta por id.
 */
export async function activarEmpire(_prev: RegistroState, fd: FormData): Promise<RegistroState> {
  if (!codigoEmpireValido(String(fd.get('codigo') ?? ''))) return { error: CODIGO_INVALIDO }

  const user = await getUser()
  if (!user) return { error: 'Tu sesión venció. Inicia sesión y vuelve a abrir el enlace.' }

  try {
    await otorgarCortesia(user.id, TIER_EMPIRE, null)
  } catch (err) {
    console.error('[registro-empire] activando:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos activar tu plan. Inténtalo de nuevo en un momento.' }
  }
  redirect('/dashboard')
}
