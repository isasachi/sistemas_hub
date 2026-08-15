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
  // Con AUTH_DISABLED no consultamos getUser (evita depender de la anon key);
  // la identidad cae al cookie anónimo, como antes de la auth.
  if (process.env.AUTH_DISABLED !== 'true') {
    const user = await getUser()
    if (user) return user.id
  }

  const store = await cookies()
  return store.get(PH_USER_COOKIE)?.value ?? null
}

export function newUserId(): string {
  return randomUUID()
}

// Un año, igual que el `maxAge` de los POST de /sessions que ya acuñaban la cookie.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Identidad para las rutas que CREAN una sesión: devuelve la existente o acuña una
 * nueva junto al header que la persiste. Devuelve un `Set-Cookie` crudo y no un
 * NextResponse porque los dos call sites responden distinto — `from-branding` un
 * NextResponse y `generar` un stream SSE (Response plano) — y el header sirve igual
 * para ambos.
 *
 * Existe porque esas dos rutas hacían `readUserId() ?? undefined`: adoptaban la
 * identidad si ya estaba, pero no la creaban cuando faltaba, y la fila nacía con
 * user_id null → invisible en el historial para siempre (16 sesiones así al
 * 2026-08-15). Los POST de /sessions ya hacían este leer-o-acuñar a mano.
 */
export async function ensureUserId(): Promise<{ uid: string; setCookie?: string }> {
  const uid = await readUserId()
  if (uid) return { uid }
  const nuevo = newUserId()
  return {
    uid: nuevo,
    setCookie: `${PH_USER_COOKIE}=${nuevo}; Path=/; HttpOnly; Max-Age=${COOKIE_MAX_AGE}`,
  }
}
