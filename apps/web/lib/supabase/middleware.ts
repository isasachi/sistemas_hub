import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refresca la sesión en cada request (los tokens de Supabase expiran) y aplica
// el gating de rutas. Patrón estándar de @supabase/ssr para App Router.
//
// Rutas protegidas (requieren sesión): /dashboard y /tools/*.
// Rutas de auth (/login, /signup) y la home (/) redirigen a /dashboard si ya hay sesión.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: no meter lógica entre createServerClient y getUser (riesgo de
  // sesiones que no refrescan y logouts aleatorios).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Restricción temporal: si LOGIN_ALLOWLIST está seteada, solo esos emails
  // tienen acceso. Un usuario logueado fuera de la lista se trata como anónimo
  // (queda bloqueado en /login con aviso). Vacía = sin restricción.
  const allowlist = (process.env.LOGIN_ALLOWLIST ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const restricted =
    allowlist.length > 0 && user != null && !allowlist.includes((user.email ?? '').toLowerCase())
  const activeUser = restricted ? null : user

  const { pathname } = request.nextUrl
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/tools')
  const isAuthPage = pathname === '/login' || pathname === '/signup'
  const isHome = pathname === '/'

  if (!activeUser && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    if (restricted) url.searchParams.set('error', 'restricted')
    else url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (activeUser && (isAuthPage || isHome)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Devolver supabaseResponse tal cual para preservar las cookies de sesión.
  return supabaseResponse
}
