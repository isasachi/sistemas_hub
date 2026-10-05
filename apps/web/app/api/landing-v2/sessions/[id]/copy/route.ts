import { NextRequest, NextResponse } from 'next/server'
import { saveV2Session } from '@/lib/landing-v2/db'
import { sectionSupport } from '@/lib/landing-v2/flow'
import { inSkeletonOrder } from '@/lib/landing-v2/catalog'
import { generateSectionCopy } from '@/lib/landing-v2/section'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Paso 6 del wizard: copy de las secciones seleccionadas que no lo tengan (o de todas con `regenerate`).
// Las sin datos que las respalden se saltan: no se inventa contenido.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const row = await load((await params).id)
  if (!row) return notFound()
  const { regenerate } = (await req.json().catch(() => ({}))) as { regenerate?: boolean }
  try {
    const s = row.session
    const ids = inSkeletonOrder(s.selected).filter((id) => sectionSupport(s, id).ok && (regenerate || !s.copies[id]))
    const copies = { ...s.copies }
    // De a 4 en paralelo: 14 llamadas en serie no caben cómodas en el presupuesto de la ruta.
    for (let i = 0; i < ids.length; i += 4) {
      const lote = ids.slice(i, i + 4)
      const out = await Promise.all(lote.map((id) => generateSectionCopy(s, id)))
      lote.forEach((id, j) => { copies[id] = out[j] })
    }
    const session = { ...s, copies }
    await saveV2Session(session)
    return NextResponse.json({ session })
  } catch (e) { return errorResponse(e) }
}
