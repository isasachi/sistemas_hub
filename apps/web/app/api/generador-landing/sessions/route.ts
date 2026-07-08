import { NextResponse } from 'next/server'
import { createLandingSession, listLandingSessions } from '@/lib/landing/db'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  // Resolvemos la identidad ANTES de crear para escribir user_id en la fila (historial).
  let uid = await readUserId()
  const isNew = !uid
  if (isNew) uid = newUserId()
  const id = await createLandingSession(uid!)
  const res = NextResponse.json({ id })
  if (isNew)
    res.cookies.set(PH_USER_COOKIE, uid!, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}

export async function GET() {
  const uid = await readUserId()
  if (!uid) return NextResponse.json({ sessions: [] })
  const rows = await listLandingSessions(uid)
  const sessions = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    step: r.step,
    title: r.product_name || 'Landing sin nombre',
    thumb: r.sections?.find((s) => s.imageUrl)?.imageUrl ?? r.product_photo_urls?.[0] ?? null,
    done: !!r.sections?.length && r.sections.every((s) => s.status === 'done'),
  }))
  return NextResponse.json({ sessions })
}
