import { NextRequest, NextResponse } from 'next/server'
import { markSeen } from '@ph/shared'
import { readUserId } from '@/lib/product-hunter/session'

// Marca productos como vistos por el usuario actual, para no repetírselos.
export async function POST(req: NextRequest) {
  const userId = await readUserId()
  if (!userId) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  let body: { productIds?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const ids = body.productIds ?? []
  if (!Array.isArray(ids) || !ids.length) {
    return NextResponse.json({ error: 'Falta productIds' }, { status: 400 })
  }

  await markSeen(userId, ids)
  return NextResponse.json({ ok: true, marked: ids.length })
}
