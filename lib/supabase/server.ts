import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Cliente Supabase para Server Components, Server Actions y Route Handlers.
// `cookies()` es async en Next 16, por eso este helper es async. Lee/escribe la
// sesión en cookies; el `set` puede fallar al llamarse desde un Server Component
// (no puede mutar cookies durante el render) — se ignora porque el middleware
// refresca la sesión en cada request.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Llamado desde un Server Component: lo maneja el middleware.
          }
        },
      },
    }
  )
}

// Helper reutilizable: devuelve el usuario autenticado o null. Usa getUser()
// (valida el JWT contra Supabase), no getSession() (solo lee la cookie).
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
