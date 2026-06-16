import { createBrowserClient } from '@supabase/ssr'

// Cliente Supabase para componentes de cliente (browser). Usa la anon key
// pública — NUNCA la service role. La sesión vive en cookies gestionadas por
// @supabase/ssr (sincronizadas con el server vía middleware).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
