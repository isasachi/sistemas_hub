import { NextResponse } from 'next/server'
import { createBrandingSession } from '@/lib/branding/db'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const id = await createBrandingSession()
  const res = NextResponse.json({ id })
  // Asegura identidad anónima (ph_uid) para que el tope POR-USUARIO de generación
  // aplique en este flujo (sin esto readUserId cae a null y solo corta el tope global).
  if (!(await readUserId()))
    res.cookies.set(PH_USER_COOKIE, newUserId(), { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
  return res
}
