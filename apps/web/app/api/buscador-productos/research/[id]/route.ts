import { NextRequest, NextResponse } from 'next/server'
import { getUrlResearch } from '@ph/shared'
import { getUser } from '@/lib/supabase/server'

// Polling del resultado. Solo LEE de Supabase — la UI lo llama cada ~3s hasta que
// status sea ready/error/blocked.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const row = await getUrlResearch(id)
  // La pertenencia se comprueba ACÁ y no en `getUrlResearch`: ese accesor vive en
  // `@ph/shared` y lo usa también el poller del VPS, que legítimamente lee las filas
  // de cualquiera. Mismo 404 para "no existe" y "no es tuya", como en el resto de las
  // rutas de sesión: distinguirlos confirma la existencia de la fila ajena.
  if (!row || row.user_id !== user.id)
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  return NextResponse.json({ status: row.status, result: row.result, error: row.error })
}
