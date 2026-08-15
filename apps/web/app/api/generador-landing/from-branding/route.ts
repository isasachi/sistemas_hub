import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession } from '@/lib/branding/db'
import { createLandingSession, updateLandingSession } from '@/lib/landing/db'
import { ensureUserId } from '@/lib/product-hunter/session'
import type { SectionType } from '@/lib/landing/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Handoff branding → landing: crea una sesión de landing pre-llenada con los datos de
// la marca (producto, foto del mockup/logo, sistema de diseño) y la deja en el paso de
// IDENTIDAD (step 2) para que el usuario continúe el wizard. Sin LLM aquí → sin costo ni
// cuota. Las URLs de mockup/logo (Storage) se escriben directo a product_photo_urls (la
// ruta de fotos solo acepta uploads binarios).
//
// El SISTEMA DE DISEÑO de la landing sale de la marca (decisión 2026-08-07): `brand_system`
// trae paleta con roles, polaridad, tipografía, halo y partículas, y manda sobre el nicho.
// `tone` queda vacío a propósito — la actitud de branding no mapea 1:1 con los 6 tonos de
// landing y el usuario lo elige en ese wizard.

const DEFAULT_SECTIONS: SectionType[] = ['hero', 'beneficios', 'oferta', 'testimonios', 'garantia', 'cta-final']

export async function POST(req: NextRequest) {
  let body: { brandingSessionId?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  if (!body.brandingSessionId)
    return NextResponse.json({ error: 'Falta brandingSessionId' }, { status: 400 })

  const bs = await getBrandingSession(body.brandingSessionId)
  if (!bs) return NextResponse.json({ error: 'Sesión de branding no encontrada' }, { status: 404 })

  // El mockup del producto es la mejor foto para una landing; la identidad es un
  // tablero y no sirve como imagen de producto.
  const photo = bs.container_url || bs.logo_url

  // Acuñar la identidad si falta, no solo adoptarla: este handoff crea la sesión
  // como efecto secundario de otra acción, y un navegador sin cookie ph_uid dejaba
  // la landing huérfana (user_id null → fuera del historial para siempre).
  const { uid, setCookie } = await ensureUserId()
  const id = await createLandingSession(uid)
  await updateLandingSession(id, {
    product_name: bs.brand_name ?? null,
    audience: bs.target_audience || null,
    benefits: bs.product_type || null,
    price: '',
    tone: [],
    product_photo_urls: photo ? [photo] : [],
    // Los hex SÍ existen ahora (2026-08-07): `brand_system` los lee del board de identidad al
    // generarlo. Se COPIA acá — leerlo al vuelo dejaría que una regeneración del board mutara en
    // silencio el sistema de diseño de una landing ya generada. Null en sesiones de branding
    // anteriores a hoy (nunca corrieron el hook) → la landing cae a visión + nicho.
    brand_system: bs.brand_system ?? null,
    selected_sections: DEFAULT_SECTIONS,
    // Para en el paso de IDENTIDAD visual (step 2, F3): el usuario revisa la marca
    // derivada (su paleta de branding gana) y sigue el wizard.
    step: 2,
  })

  const res = NextResponse.json({ id })
  if (setCookie) res.headers.set('Set-Cookie', setCookie)
  return res
}
