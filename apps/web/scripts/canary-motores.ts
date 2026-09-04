/**
 * CANARIO GRATIS de los dos motores nuevos, ANTES de gastar un render.
 *
 * Mismo truco que `canary-grok.ts`: la validación corre ANTES de despachar, así que un
 * cuerpo con UN campo inválido vuelve con el error y **sin `taskId` y sin cobrar**. Cada
 * canario lleva exactamente un campo malo — con dos, el primero enmascara al segundo y el
 * probe deja de medir lo que cree.
 *
 * ⚠️ TODO CANARIO DE ACÁ LLEVA UN MODELO O UNA RUTA QUE NO PUEDE DESPACHAR. Un cuerpo
 * válido con un campo "raro" es un render pagado si el campo resulta no validarse; un
 * nombre de modelo inexistente no puede despachar nunca.
 *
 *   npx tsx --env-file=.env.local scripts/canary-motores.ts
 */
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const KIE = 'https://api.kie.ai/api/v1/jobs/createTask'
const corto = (x: unknown) => JSON.stringify(x).slice(0, 400)

async function kieCanario(nombre: string, key: string, input: Record<string, unknown>, model: string) {
  const r = await fetch(KIE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(60_000),
  })
  const j = await r.json().catch(() => null) as { code?: number; msg?: string; data?: { taskId?: string } } | null
  const id = j?.data?.taskId
  console.log(`  ${nombre}: HTTP ${r.status} · code ${j?.code} · ${id ? `⚠️ DESPACHÓ ${id}` : 'sin taskId'} · ${j?.msg ?? corto(j)}`)
  return !!id
}

async function xaiCanario(nombre: string, key: string, path: string, body: Record<string, unknown>) {
  const r = await fetch(`https://api.x.ai${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const t = await r.text()
  console.log(`  ${nombre}: HTTP ${r.status} · ${t.slice(0, 400)}`)
}

async function main() {
  const { data: filas } = await db.from('video_sessions').select('id, user_id')
  const sesion = (filas as { id: string; user_id: string }[] | null)?.find((f) => f.id.startsWith('7e4ccbcf'))
  if (!sesion) throw new Error('no se encontró la sesión')
  const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', sesion.user_id).single()
  const kie = String((st as { kie_api_key?: string })?.kie_api_key ?? '')
  const xai = String(process.env.XAI_API_KEY ?? '')
  const imagen = 'https://example.com/no-existe.png'
  const video = 'https://example.com/no-existe.mp4'

  console.log(`KIE · Kling Motion Control  (key ${kie ? 'ok' : 'FALTA'})`)
  // 1. Modelo inexistente: no puede despachar. Verifica endpoint, auth y forma del error.
  await kieCanario('modelo inexistente        ', kie, { input_urls: [imagen], video_urls: [video] }, 'kling-3.0/motion-control-NO')
  // 2. Modelo real + el `mode` que el probe manda hoy. La doc dice `std`|`pro`.
  await kieCanario("mode: '720p' (el del probe)", kie, {
    prompt: 'x', input_urls: [imagen], video_urls: [video],
    mode: '720p', character_orientation: 'video', background_source: 'input_video',
  }, 'kling-3.0/motion-control')

  console.log(`\nxAI · Video Edit  (key ${xai ? 'ok' : 'FALTA'})`)
  // Modelo inexistente en cada ruta candidata: descubre cuál existe sin poder despachar.
  for (const path of ['/v1/videos/edits', '/v1/videos/generations', '/v1/videos']) {
    await xaiCanario(path.padEnd(24), xai, path, { model: 'grok-imagine-video-NO', prompt: 'x', video_url: video })
  }
  // El 422 de arriba dijo `missing field video`: la ruta existe y el campo se llama `video`.
  await xaiCanario('edits · video{} + modelo NO', xai, '/v1/videos/edits',
    { model: 'grok-imagine-video-NO', prompt: 'x', video: { url: video } })
  // Y con el modelo REAL, sobre una URL inalcanzable: no puede generar nada.
  await xaiCanario('edits · video{} + modelo real', xai, '/v1/videos/edits',
    { model: 'grok-imagine-video', prompt: 'x', video: { url: video } })
}
main().catch((e) => { console.error(e); process.exit(1) })
