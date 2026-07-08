import { NextResponse } from 'next/server'
import { createSession, listSessions } from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/session'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  try {
    // Resolvemos la identidad ANTES de crear para escribir user_id en la fila (historial).
    let uid = await readUserId()
    const isNew = !uid
    if (isNew) uid = newUserId()
    const id = await createSession(uid!)
    const res = NextResponse.json({ id })
    res.cookies.set(SESSION_COOKIE, id, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 })
    if (isNew)
      res.cookies.set(PH_USER_COOKIE, uid!, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const uid = await readUserId()
  if (!uid) return NextResponse.json({ sessions: [] })
  const rows = await listSessions(uid)
  const sessions = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    step: r.step,
    title: r.product_name || 'Anuncio sin nombre',
    thumb: r.image_url,
    done: !!r.image_url,
  }))
  return NextResponse.json({ sessions })
}
