// Persistencia de landing v2 (`landing_v2_sessions`). La sesión es un jsonb serializable: el núcleo
// no depende de estado de React, y moverlo a un backend aparte es mover este archivo.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { UIMessage } from 'ai'
import { emptySession, LandingSessionSchema, type LandingSession } from './schemas'

let _db: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_db) _db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _db
}

const T = 'landing_v2_sessions'

export async function createV2Session(userId: string, view: LandingSession['view']): Promise<LandingSession> {
  const { data, error } = await getDb().from(T).insert({ user_id: userId, view }).select('id').single()
  if (error) throw new Error(error.message)
  const session = emptySession(data.id as string, view)
  await saveV2Session(session)
  return session
}

/** La sesión del usuario, o null si no existe o no es suya. */
export async function getV2Session(id: string, userId: string | null): Promise<{ session: LandingSession; messages: UIMessage[] } | null> {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data, error } = await getDb().from(T).select('session, messages').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  // Una sesión guardada con un sistema visual o diseños de otra forma (cambió el schema) no se rompe: se
  // descartan (el sistema se re-analiza antes de la próxima sección; los diseños solo alimentan la regla
  // de no repetir textos).
  const ok = LandingSessionSchema.safeParse(data.session)
  const session = ok.success ? ok.data : LandingSessionSchema.parse({ ...data.session, visualSystem: null, designs: {} })
  return { session, messages: (data.messages ?? []) as UIMessage[] }
}

export async function saveV2Session(session: LandingSession): Promise<void> {
  const { error } = await getDb().from(T)
    .update({ session: LandingSessionSchema.parse(session), updated_at: new Date().toISOString() })
    .eq('id', session.id)
  if (error) throw new Error(error.message)
}

export async function saveV2Messages(id: string, messages: UIMessage[]): Promise<void> {
  const { error } = await getDb().from(T).update({ messages, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
