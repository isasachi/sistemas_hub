/**
 * Vigila una tarea de KIE hasta que cambie de estado. GRATIS: `recordInfo` es un GET.
 *
 * Existe porque `seedance-2-fast` se quedó en `waiting` 27 minutos y el probe la abandonó
 * al vencer su plazo. Una tarea creada sigue viva del lado de KIE; lo que faltaba era mirarla
 * sin volver a crearla.
 *
 *   npx tsx --env-file=.env.local scripts/vigia-tarea.ts <taskId>
 */
import { createClient } from '@supabase/supabase-js'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el taskId')
  const { data: filas } = await db.from('video_sessions').select('id, user_id')
  const s = (filas as { id: string; user_id: string }[]).find((f) => f.id.startsWith('7e4ccbcf'))!
  const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', s.user_id).single()
  const key = (st as { kie_api_key: string }).kie_api_key
  let previo = ''
  for (;;) {
    const r = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${id}`, { headers: { Authorization: `Bearer ${key}` } })
    const d = ((await r.json()) as { data?: Record<string, unknown> }).data ?? {}
    const estado = String(d.state ?? '?')
    if (estado !== previo) {
      previo = estado
      const url = (JSON.parse(String(d.resultJson || '{}')) as { resultUrls?: string[] }).resultUrls?.[0]
      console.log(`${new Date().toISOString().slice(11, 19)} · ${estado} · créditos ${d.creditsConsumed} ${url ?? ''} ${d.failMsg ?? ''}`)
      if (estado === 'success' || estado === 'fail') return
    }
    await new Promise((ok) => setTimeout(ok, 120_000))
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
