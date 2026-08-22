// Un solo cliente Supabase para todo el motor nuevo. Estaba copiado en cada
// módulo de `db/` y ya iban cinco copias del mismo bloque.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _db: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return _db
}
