// Utilidades de las rutas de landing v2. Las rutas son DELGADAS: validan, llaman al núcleo
// (`lib/landing-v2`) y responden. Nada de lógica de negocio acá.
import { NextResponse } from 'next/server'
import { readUserId } from '@/lib/product-hunter/session'
import { currentCreditOwner } from '@/lib/credits'
import { getV2Session } from '@/lib/landing-v2/db'
import { DocumentError } from '@/lib/landing-v2/document'
import { QuotaError, type Ctx } from '@/lib/landing-v2/quota'
import { SupportError } from '@/lib/landing-v2/section'
import { UserError } from '@/lib/landing-v2/schemas'

export const notFound = () => NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

/** La sesión del usuario de esta request + el contexto de cobro, o null. */
export async function load(id: string) {
  const userId = await readUserId()
  if (!userId) return null
  const row = await getV2Session(id, userId)
  if (!row) return null
  const ctx: Ctx = { userId, owner: await currentCreditOwner() }
  return { ...row, ctx }
}

export function errorResponse(e: unknown) {
  if (e instanceof QuotaError) return NextResponse.json({ error: e.message }, { status: e.status })
  if (e instanceof SupportError) return NextResponse.json({ error: e.message, suggest: e.suggest }, { status: 409 })
  if (e instanceof DocumentError) return NextResponse.json({ error: e.message }, { status: 400 })
  if (e instanceof UserError) return NextResponse.json({ error: e.message, retryable: true }, { status: 422 })
  console.error('[landing-v2]', e)
  return NextResponse.json({ error: 'Ocurrió un error. Inténtalo de nuevo.', retryable: true }, { status: 500 })
}
