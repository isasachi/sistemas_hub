import { NextResponse, type NextRequest } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { setKieKey } from '@/lib/user-settings'

/**
 * Guarda la API key de KIE del usuario (BYOK del generador de video).
 *
 * Exige sesión por su cuenta: `/api/*` está fuera del matcher de `proxy.ts`. Sin
 * esto, cualquiera podría escribirle una key a cualquier cuenta.
 *
 * Nunca devuelve la key guardada — solo confirma. Ver `maskKey` en user-settings.ts.
 */
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  let body: { key?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  if (typeof body.key !== 'string') {
    return NextResponse.json({ error: 'Falta la key' }, { status: 400 })
  }
  // Tope defensivo: una key de KIE son ~40 caracteres. Sin esto la columna acepta
  // un texto arbitrario de cualquier tamaño.
  if (body.key.length > 200) {
    return NextResponse.json({ error: 'Esa key es demasiado larga' }, { status: 400 })
  }

  try {
    await setKieKey(user.id, body.key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[ajustes] guardando kie key:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'No pudimos guardar la key' }, { status: 500 })
  }
}
