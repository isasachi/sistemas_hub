import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/session'

export async function POST() {
  const id = await createSession()
  const res = NextResponse.json({ id })
  res.cookies.set(SESSION_COOKIE, id, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 })
  return res
}
