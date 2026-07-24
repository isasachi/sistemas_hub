import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CalcInputs } from './model'

// Cliente lazy singleton para el historial de la calculadora (espeja landing/db.ts).
// A diferencia de las otras tools, la sesión se crea al FINAL (al llegar al resultado),
// no al empezar el wizard.
let _db: SupabaseClient | null = null

function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _db
}

// KPIs para el preview de la card (evita recalcular en el listado). La vista detalle
// sí recalcula al vuelo con calcular(inputs) para quedar consistente con el modelo.
export interface CalcSnapshot {
  funnel: 'leads' | 'mensajes'
  precioVenta: number
  profitNeto: number
  margenNeto: number
  roiAds: number
}

export interface CalcSessionRow {
  id: string
  created_at: string
  inputs: CalcInputs
  snapshot: CalcSnapshot
}

export async function createCalcSession(
  userId: string,
  inputs: CalcInputs,
  snapshot: CalcSnapshot
): Promise<string> {
  const { data, error } = await getDb()
    .from('calc_sessions')
    .insert({ user_id: userId, inputs, snapshot })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function updateCalcSession(
  id: string,
  inputs: CalcInputs,
  snapshot: CalcSnapshot
): Promise<void> {
  const { error } = await getDb()
    .from('calc_sessions')
    .update({ inputs, snapshot })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getCalcSession(id: string): Promise<CalcSessionRow | null> {
  const { data, error } = await getDb()
    .from('calc_sessions')
    .select('id, created_at, inputs, snapshot')
    .eq('id', id)
    .single()
  if (error) return null
  return data as CalcSessionRow
}

export async function listCalcSessions(userId: string): Promise<CalcSessionRow[]> {
  const { data, error } = await getDb()
    .from('calc_sessions')
    .select('id, created_at, inputs, snapshot')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return []
  return (data ?? []) as CalcSessionRow[]
}

export async function deleteCalcSession(id: string): Promise<void> {
  const { error } = await getDb().from('calc_sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
