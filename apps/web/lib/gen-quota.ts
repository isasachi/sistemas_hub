/**
 * Gate y registro de las generaciones del hub (1 fila en ph_gen_usage por generación
 * exitosa, keyed por session_id + kind).
 *
 * ⚠️ EL ÚNICO LÍMITE SON LOS CRÉDITOS DEL PLAN (2026-11-23, decisión del dueño del repo).
 * Antes había dos capas más y se borraron a propósito:
 *   - un tope PER-STEP de 1 gen + 3 regens por (sesión, paso): le cortaba el paso a
 *     un usuario que todavía tenía créditos comprados;
 *   - un backstop GLOBAL de 500 generaciones/día para TODO el hub: no era por usuario,
 *     así que con suficiente tráfico le cerraba el servicio a todos a la vez.
 * No las reintroduzcas como "red de seguridad" sin hablarlo: el tope es lo que el
 * usuario compró. Consecuencia asumida: lo que NO gasta créditos (el texto y todo el
 * video, ver credits.ts) no tiene tope.
 *
 * checkGenQuota decide ANTES de generar; recordGenQuota inserta DESPUÉS de un éxito
 * (un fallo no gasta crédito). Las filas siguen siendo el saldo de créditos y la única
 * visibilidad del costo real (panel de consumo del admin), así que se registran
 * también los kinds que no gastan crédito. Tabla: ph_gen_usage —
 * migraciones 20260622000001_ph_gen_usage.sql + 20260626000002_ph_gen_usage_session.sql.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { limaSearchDay } from './product-hunter/quota'
import { checkCredits, type CreditStatus, type CreditOwner } from './credits'

let _db: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return _db
}

/**
 * Decide ANTES de generar. NO inserta nada.
 * - blocked: un Response listo (texto en español) o null si puede proceder.
 * - credits: el saldo del usuario si el kind gasta créditos, o null.
 *
 * Hoy es exactamente `checkCredits`; se mantiene como el único punto de entrada de las
 * rutas caras para que un límite futuro entre en un solo lugar.
 */
export async function checkGenQuota(
  kind: string,
  // Dueño de los créditos ya resuelto. Solo lo pasa el stream de branding, que llama
  // a esta función con los headers de la respuesta ya enviados y por eso no puede
  // leer las cookies de la request. Ver `CreditOwner` en credits.ts.
  owner?: CreditOwner | null,
): Promise<{ blocked: Response | null; credits: CreditStatus | null }> {
  return checkCredits(kind, owner)
}

/** Registra una generación exitosa (1 fila). Llamar SOLO tras generar OK.
 * NUNCA lanza: envuelve en try/catch para proteger al caller (la generación ya fue exitosa).
 */
export async function recordGenQuota(sessionId: string | null, kind: string, userId: string | null): Promise<void> {
  try {
    const { error } = await getDb().from('ph_gen_usage').insert({ user_id: userId, kind, gen_day: limaSearchDay(), session_id: sessionId })
    if (error) console.error('[gen-quota] registrando:', error.message)
  } catch (err) {
    console.error('[gen-quota] registrando:', err instanceof Error ? err.message : String(err))
  }
}
