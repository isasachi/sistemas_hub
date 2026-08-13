import { NextResponse } from 'next/server'
import { createVideoSession, listVideoSessions } from '@/lib/video-ads/db'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  // Resolvemos la identidad ANTES de crear para escribir user_id en la fila (historial).
  let uid = await readUserId()
  const isNew = !uid
  if (isNew) uid = newUserId()
  const id = await createVideoSession(uid!)
  const res = NextResponse.json({ id })
  if (isNew)
    res.cookies.set(PH_USER_COOKIE, uid!, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}

export async function GET() {
  const uid = await readUserId()
  if (!uid) return NextResponse.json({ sessions: [] })
  const rows = await listVideoSessions(uid)
  const sessions = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    step: r.step,
    title: r.product_name || 'Video sin nombre',
    // El video terminado es su propia miniatura (el board pinta el primer frame). Solo
    // se manda si es el mp4 que copiamos al bucket: si la copia falló, `video_url` es
    // de KIE y puede no terminar en .mp4, que es lo que el board usa para distinguir
    // video de imagen. En ese caso, y a media sesión, cae al still que ya exista.
    thumb: r.video_url?.includes('.mp4') ? r.video_url : (r.character_url ?? r.product_url ?? null),
    // Fix round 5: `!!r.video_url` marcaba "listo" apenas el PRIMER lote terminaba
    // (es lo que `video_url` guarda) — un render de 4 lotes con solo el primero OK
    // ya mostraba el check verde. `render_done` (columna cacheada, ver db.ts /
    // render-lotes.ts `renderDone`) solo es `true` cuando TODOS los lotes resolvieron.
    done: !!r.render_done,
  }))
  return NextResponse.json({ sessions })
}
