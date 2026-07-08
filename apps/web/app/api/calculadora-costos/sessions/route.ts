import { NextRequest, NextResponse } from 'next/server'
import { createCalcSession, listCalcSessions, type CalcSnapshot } from '@/lib/calculadora-costos/db'
import type { CalcInputs } from '@/lib/calculadora-costos/model'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { inputs?: CalcInputs; snapshot?: CalcSnapshot }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.inputs || !body.snapshot)
    return NextResponse.json({ error: 'Faltan inputs/snapshot' }, { status: 400 })

  let uid = await readUserId()
  const isNew = !uid
  if (isNew) uid = newUserId()
  const id = await createCalcSession(uid!, body.inputs, body.snapshot)
  const res = NextResponse.json({ id })
  if (isNew)
    res.cookies.set(PH_USER_COOKIE, uid!, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}

export async function GET() {
  const uid = await readUserId()
  if (!uid) return NextResponse.json({ sessions: [] })
  const rows = await listCalcSessions(uid)
  const sessions = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    step: 0,
    title: `${r.snapshot.funnel === 'leads' ? 'Por leads' : 'Por mensajes'} · S/ ${Math.round(r.snapshot.precioVenta)}`,
    thumb: null,
    done: true,
  }))
  return NextResponse.json({ sessions })
}
