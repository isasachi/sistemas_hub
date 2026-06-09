import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

// Identidad del usuario para no repetirle productos ya vistos.
// Reemplaza al session.json/UUID del proyecto Python por una cookie httpOnly.
// No es auth real — solo un id estable y anónimo por navegador (pool compartido).
export const PH_USER_COOKIE = 'ph_uid'

// Lee el user id de la cookie. Si no existe, devuelve null (la ruta lo crea y
// lo setea en la respuesta — las cookies solo se pueden escribir en la response).
export async function readUserId(): Promise<string | null> {
  const store = await cookies()
  return store.get(PH_USER_COOKIE)?.value ?? null
}

export function newUserId(): string {
  return randomUUID()
}
