// Utilidades de las rutas de anuncios. Las rutas son DELGADAS: validan el request, llaman al
// núcleo (`lib/anuncios/core.ts`) y responden. Nada de lógica de negocio acá.
import { NextResponse } from 'next/server'
import { readUserId } from '@/lib/product-hunter/session'
import { currentCreditOwner } from '@/lib/credits'
import { getSession } from '@/lib/db'
import { AnunciosError, type Ctx, type Img } from '@/lib/anuncios/core'

export const notFound = () => NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

/** La sesión del usuario de esta request + el contexto de cobro, o null. */
export async function load(id: string) {
  const userId = await readUserId()
  const session = await getSession(id, userId)
  if (!session || !userId) return null
  const ctx: Ctx = { userId, owner: await currentCreditOwner() }
  return { session, ctx }
}

export function errorResponse(e: unknown, fallback = 'Ocurrió un error. Inténtalo de nuevo.') {
  if (e instanceof AnunciosError) return NextResponse.json(e.body, { status: e.status })
  console.error('[anuncios]', e)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function toImg(file: File, fallbackMime: string): Promise<Img> {
  return { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type || fallbackMime }
}
