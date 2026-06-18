import { NextResponse } from 'next/server'
import { createBrandingSession } from '@/lib/branding/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const id = await createBrandingSession()
  return NextResponse.json({ id })
}
