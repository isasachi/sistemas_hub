import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { getUser } from '@/lib/supabase/server'

// Identidad del usuario para no repetirle productos ya vistos.
// Preferimos el id del usuario AUTENTICADO (Supabase Auth). Como fallback —y para
// no romper si alguien llega sin sesión— usamos una cookie httpOnly anónima
// (legado del proyecto Python, pool compartido por navegador).
export const PH_USER_COOKIE = 'ph_uid'

// Devuelve la identidad del usuario:
//  1. id del usuario autenticado, si hay sesión (estable y por-persona);
//  2. si no, el id de la cookie anónima; null si tampoco existe (la ruta la crea).
export async function readUserId(): Promise<string | null> {
  const user = await getUser()
  if (user) return user.id

  const store = await cookies()
  return store.get(PH_USER_COOKIE)?.value ?? null
}

export function newUserId(): string {
  return randomUUID()
}
