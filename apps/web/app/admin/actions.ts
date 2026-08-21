'use server'

/**
 * Mutaciones del panel de administración.
 *
 * ⚠️ ACÁ EL `userId` DEL FORMULARIO SÍ SE USA — al revés que en app/cuenta/actions.ts,
 * y la diferencia importa. En "Mi cuenta" el usuario objetivo SIEMPRE es el de la
 * sesión, así que aceptarlo del cliente sería dejar que cualquiera le escriba a otro.
 * Acá el objetivo es otra persona por definición: lo que no puede venir del cliente es
 * el PERMISO. Por eso cada acción arranca con `currentAdmin()`, que resuelve la sesión
 * por su cuenta y verifica el rol contra la DB.
 *
 * Server actions y no rutas de `/api/*` justamente por eso: esas rutas no pasan por el
 * middleware ni por ningún layout (AGENTS.md), así que un endpoint de API que otorgue
 * plan sería escalada de privilegios abierta a internet.
 */
import { revalidatePath } from 'next/cache'
import { isTier, toTier } from '@ph/shared'
import { currentAdmin, setRole, toRole } from '@/lib/roles'
import { setCreditBonus } from '@/lib/credits'
import { otorgarCortesia, quitarCortesia } from '@/lib/admin'

export type FormState = { error?: string; ok?: string }

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? '').trim()

const SIN_PERMISO = 'No tienes permiso para hacer esto.'

/** El objetivo de la acción, validado. Sin admin o sin id, no se toca nada. */
async function objetivo(fd: FormData): Promise<{ adminId: string; userId: string } | FormState> {
  const admin = await currentAdmin()
  if (!admin) return { error: SIN_PERMISO }
  const userId = texto(fd, 'userId')
  if (!userId) return { error: 'Falta el usuario.' }
  return { adminId: admin.id, userId }
}

const fallo = (r: unknown): r is FormState => typeof (r as FormState).error === 'string'

function refrescar(userId: string) {
  revalidatePath('/admin')
  revalidatePath(`/admin/${userId}`)
}

export async function cambiarRol(_prev: FormState, fd: FormData): Promise<FormState> {
  const q = await objetivo(fd)
  if (fallo(q)) return q
  const role = toRole(texto(fd, 'role'))

  // ⚠️ Nadie se quita a sí mismo el rol. Con un solo admin real eso deja el panel sin
  // dueño, y recuperarlo exige tocar la env o la DB a mano. El costo de la guarda es
  // un `if`; el del incidente, un deploy.
  if (q.userId === q.adminId && role !== 'admin') {
    return { error: 'No puedes quitarte a ti mismo el rol de administrador.' }
  }

  try {
    await setRole(q.userId, role)
  } catch (err) {
    console.error('[admin] rol:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos guardar el rol.' }
  }
  refrescar(q.userId)
  return { ok: `Rol actualizado a ${role}.` }
}

export async function otorgarAcceso(_prev: FormState, fd: FormData): Promise<FormState> {
  const q = await objetivo(fd)
  if (fallo(q)) return q

  const crudo = Number(texto(fd, 'tier'))
  // `toTier` cae al plan 1 ante cualquier basura, y acá eso sería regalar el plan
  // equivocado en silencio. Se rechaza en vez de normalizar.
  if (!isTier(crudo)) return { error: 'Plan inválido.' }

  try {
    await otorgarCortesia(q.userId, toTier(crudo))
  } catch (err) {
    console.error('[admin] cortesía:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos otorgar el acceso.' }
  }
  refrescar(q.userId)
  return { ok: `Acceso de cortesía al plan ${crudo} otorgado.` }
}

export async function revocarAcceso(_prev: FormState, fd: FormData): Promise<FormState> {
  const q = await objetivo(fd)
  if (fallo(q)) return q

  let habia: boolean
  try {
    habia = await quitarCortesia(q.userId)
  } catch (err) {
    console.error('[admin] revocar:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos quitar el acceso.' }
  }
  refrescar(q.userId)
  // Decir la verdad importa acá: si el acceso venía de una membership real o de la
  // lista de grandfathered, no se quitó nada y el usuario SIGUE entrando. Reportar
  // "retirada" mandaba al admin a suponer lo contrario.
  if (!habia)
    return {
      error:
        'Este usuario no tenía cortesía, así que no se quitó nada — su acceso viene ' +
        'de una suscripción de Whop o de la lista de accesos permanentes, y sigue vigente.',
    }
  return { ok: 'Cortesía retirada. Una suscripción real de Whop no se toca desde acá.' }
}

export async function ajustarCreditos(_prev: FormState, fd: FormData): Promise<FormState> {
  const q = await objetivo(fd)
  if (fallo(q)) return q

  const bonus = Number(texto(fd, 'bonus'))
  if (!Number.isFinite(bonus) || bonus < 0) return { error: 'Pon un número de 0 en adelante.' }
  if (bonus > 5000) return { error: 'Máximo 5000 créditos de cortesía.' }

  try {
    await setCreditBonus(q.userId, bonus)
  } catch (err) {
    console.error('[admin] créditos:', err instanceof Error ? err.message : String(err))
    return { error: 'No pudimos guardar los créditos.' }
  }
  refrescar(q.userId)
  return { ok: bonus > 0 ? `${bonus} créditos de cortesía activos.` : 'Cortesía de créditos quitada.' }
}
