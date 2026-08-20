import { NextResponse, type NextRequest } from 'next/server'
import { getUser } from '@/lib/supabase/server'
import { createCheckout } from '@/lib/whop'

/**
 * Crea la checkout configuration del usuario logueado y lo manda a pagar.
 *
 * ponytail: GET que redirige, no POST + fetch desde el cliente. Así la página de
 * suscripción es un `<a href>` y no necesita ser client component ni manejar estado.
 * Se usa `<a>` y no `<Link>` a propósito: Next prefetchea los `<Link>` a páginas y no
 * queremos crear configuraciones de checkout por pasar el mouse por encima.
 *
 * Esta ruta SÍ exige sesión por su cuenta: `/api/*` está fuera del matcher de
 * `proxy.ts`, así que acá no llega ningún gate de auth.
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  try {
    const url = await createCheckout(user.id, new URL('/dashboard', req.url).toString())
    return NextResponse.redirect(url)
  } catch (err) {
    console.error('[whop] creando checkout:', err instanceof Error ? err.message : String(err))
    return NextResponse.redirect(new URL('/suscripcion?error=checkout', req.url))
  }
}
