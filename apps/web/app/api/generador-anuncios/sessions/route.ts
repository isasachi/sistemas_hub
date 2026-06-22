import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/session'
import { readUserId, newUserId, PH_USER_COOKIE } from '@/lib/product-hunter/session'

export async function POST() {
  try {
    const id = await createSession()
    const res = NextResponse.json({ id })
    res.cookies.set(SESSION_COOKIE, id, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 })
    // Identidad anónima (ph_uid) para que el tope POR-USUARIO de generación aplique.
    if (!(await readUserId()))
      res.cookies.set(PH_USER_COOKIE, newUserId(), { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 365 })
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
