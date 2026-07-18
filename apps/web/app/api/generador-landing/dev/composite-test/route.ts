import { NextResponse } from 'next/server'
import { renderComposite } from '@/lib/landing/composite'
import { buildTheme } from '@/lib/landing/theme'
import { loadPairFonts } from '@/lib/landing/typography-catalog'
import { OfertaDemo } from './oferta-demo'

// Ruta de PRUEBA de la infra de composición (Fase 0). Solo desarrollo — 404 en prod.
// Renderiza el layout de Oferta demo sobre un fondo luminoso estático y devuelve el JPEG.
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
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  const theme = buildTheme(
    [{ name: 'Teal', hex: '#0EA5A4', usage: 'accent' }, { name: 'Ink', hex: '#0f172a' }],
    'clinico-geometrico',
  )
  const fonts = loadPairFonts('clinico-geometrico')
  const scene = await luminousScene()
  const jpeg = await renderComposite(scene, OfertaDemo(theme), { fonts })

  return new NextResponse(new Uint8Array(jpeg), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
  })
}
