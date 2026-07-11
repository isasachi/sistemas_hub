import { NextRequest, NextResponse } from 'next/server'
import { getUrlResearch } from '@ph/shared'

// Polling del resultado. Solo LEE de Supabase — la UI lo llama cada ~3s hasta que
// status sea ready/error/blocked.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await getUrlResearch(id)
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ status: row.status, result: row.result, error: row.error })
}
