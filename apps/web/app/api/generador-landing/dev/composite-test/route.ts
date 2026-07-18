import { NextResponse } from 'next/server'
import { renderComposite, blurToDataUri } from '@/lib/landing/composite'
import { buildTheme } from '@/lib/landing/theme'
import { loadPairFonts } from '@/lib/landing/typography-catalog'
import { OfertaLayout } from '@/lib/landing/layouts/oferta'
import type { OfferCopy } from '@/lib/landing/types'

// Ruta de PRUEBA de la infra de composición (Fase 0). Vive en local Y en previews de Vercel;
// 404 solo en production real. Renderiza la Oferta demo sobre un fondo luminoso → JPEG.
// GET /api/generador-landing/dev/composite-test  → image/jpeg 1080×1920
// (carpeta `dev`, NO `_dev`: el prefijo `_` es private folder de App Router y no enruta.)

export const runtime = 'nodejs' // fs para fuentes + sharp: NO edge.

// Fondo "atmósfera luminosa" generado inline (SVG→JPEG con sharp) — sin asset binario en repo.
async function luminousScene(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
    <defs><radialGradient id="g" cx="50%" cy="34%" r="80%">
      <stop offset="0%" stop-color="#eafaff"/><stop offset="45%" stop-color="#cfe9f7"/>
      <stop offset="100%" stop-color="#9fc3dc"/>
    </radialGradient></defs>
    <rect width="1080" height="1920" fill="url(#g)"/>
  </svg>`
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()
}

export async function GET() {
  // En Vercel, preview Y production corren con NODE_ENV=production; el discriminador es
  // VERCEL_ENV. Bloquear SOLO production real → la ruta de prueba se puede abrir en el
  // preview del PR (donde hay que verificar que las fuentes llegan al bundle) y en local.
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  const theme = buildTheme(
    [{ name: 'Teal', hex: '#0EA5A4', usage: 'accent' }, { name: 'Ink', hex: '#0f172a' }],
    'clinico-geometrico',
  )
  const copy: OfferCopy = {
    type: 'oferta',
    headline: 'Aprovecha la oferta',
    subheadline: 'Mientras dure el stock. Pago contra entrega en todo el Perú.',
    urgency: 'Solo hoy',
    tiers: [
      { label: '1 unidad', price: 'S/ 99', priceBefore: 'S/ 129', perUnit: 'S/ 99 c/u', cta: 'Lo quiero', featured: false },
      { label: '2 unidades', price: 'S/ 169', priceBefore: 'S/ 258', savingsPct: 35, perUnit: 'S/ 84 c/u', badge: 'Recomendado', cta: 'Lo quiero', featured: true },
      { label: '3 unidades', price: 'S/ 229', priceBefore: 'S/ 387', savingsPct: 41, perUnit: 'S/ 76 c/u', cta: 'Lo quiero', featured: false },
    ],
  }
  const fonts = loadPairFonts('clinico-geometrico')
  const scene = await luminousScene()
  const blurBg = await blurToDataUri(scene)
  const jpeg = await renderComposite(scene, OfertaLayout({ copy, theme, blurBg }), { fonts })

  return new NextResponse(new Uint8Array(jpeg), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
  })
}
