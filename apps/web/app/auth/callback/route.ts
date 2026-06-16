import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Callback de OAuth (Google). Supabase redirige acá con ?code=... ; lo
// intercambiamos por una sesión (setea las cookies vía el server client) y
// mandamos al usuario a `next` (o al dashboard).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/dashboard'
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
