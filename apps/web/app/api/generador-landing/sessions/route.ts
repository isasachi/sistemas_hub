import { NextResponse } from 'next/server'
import { createLandingSession } from '@/lib/landing/db'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const id = await createLandingSession()
  const res = NextResponse.json({ id })
  // Identidad anónima (ph_uid) para el tope POR-USUARIO de generación.
  if (!(await readUserId()))
    res.cookies.set(PH_USER_COOKIE, newUserId(), { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
