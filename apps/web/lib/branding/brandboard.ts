import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import type { Style } from './brief'

/**
 * Etapa 5: el brandboard en PDF. Sin llamadas al modelo — es una plantilla A4
 * con los assets ya generados. Se arma SIEMPRE al terminar la generación, no a
 * pedido (spec 6.5).
 *
 * ponytail: tipografía del PDF = Helvetica (las 14 estándar de PDF, cero
 * archivos que embeber). Las familias elegidas van NOMBRADAS en la ficha; para
 * renderizarlas de verdad habría que empaquetar sus TTF, que es peso y licencias.
 */

const A4 = { w: 595.28, h: 841.89 }
const M = 48 // margen

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const COLOR_LABELS: Record<string, string> = {
  primary: 'Primario', secondary: 'Secundario', accent: 'Acento', dark: 'Oscuro', light: 'Claro',
}

/** Texto que no se sale de la caja: corta y pone puntos suspensivos. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let out = text
  while (out.length > 1 && font.widthOfTextAtSize(out + '…', size) > maxWidth) out = out.slice(0, -1)
  return out + '…'
}

function section(page: PDFPage, font: PDFFont, label: string, y: number) {
  page.drawText(label.toUpperCase(), { x: M, y, size: 8, font, color: rgb(0.45, 0.45, 0.45) })
}

export interface BrandboardInput {
  brandName: string
  productDescription: string
  audience: string[]
  style: Style
  feel: string[]
  logo: Buffer | null
  mockup: Buffer | null
  label: Buffer | null
}

export async function buildBrandboard(input: BrandboardInput): Promise<Buffer> {
  const { style } = input
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([A4.w, A4.h])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const inner = A4.w - M * 2

  // Cabecera
  page.drawText(fit(input.brandName, bold, 30, inner), { x: M, y: A4.h - M - 24, size: 30, font: bold })
  page.drawText(fit(input.productDescription, regular, 11, inner), {
    x: M, y: A4.h - M - 44, size: 11, font: regular, color: rgb(0.35, 0.35, 0.35),
  })
  if (input.feel.length) {
    page.drawText(fit(input.feel.join(' · '), regular, 9, inner), {
      x: M, y: A4.h - M - 60, size: 9, font: regular, color: rgb(0.5, 0.5, 0.5),
    })
  }

  // Piezas: mockup a la izquierda, logo y etiqueta a la derecha
  const top = A4.h - M - 84
  const colW = (inner - 16) / 2
  const mockH = 300
  if (input.mockup) {
    const img = await pdf.embedPng(input.mockup)
    const s = Math.min(colW / img.width, mockH / img.height)
    page.drawImage(img, { x: M, y: top - mockH, width: img.width * s, height: img.height * s })
  }
  const rightX = M + colW + 16
  if (input.logo) {
    const img = await pdf.embedPng(input.logo)
    const s = Math.min(colW / img.width, 140 / img.height)
    page.drawImage(img, { x: rightX, y: top - 140, width: img.width * s, height: img.height * s })
  }
  if (input.label) {
    const img = await pdf.embedPng(input.label)
    const s = Math.min(colW / img.width, 145 / img.height)
    page.drawImage(img, { x: rightX, y: top - mockH, width: img.width * s, height: img.height * s })
  }

  // Paleta
  let y = top - mockH - 34
  section(page, bold, 'Paleta', y)
  y -= 62
  const swatch = (inner - 4 * 10) / 5
  Object.entries(style.palette).forEach(([key, hex], i) => {
    const x = M + i * (swatch + 10)
    page.drawRectangle({ x, y, width: swatch, height: 44, color: hexToRgb(hex),
                         borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 })
    page.drawText(COLOR_LABELS[key] ?? key, { x, y: y - 12, size: 8, font: bold })
    page.drawText(hex.toUpperCase(), { x, y: y - 22, size: 7, font: regular, color: rgb(0.45, 0.45, 0.45) })
  })

  // Tipografías + público
  y -= 52
  section(page, bold, 'Tipografías', y)
  y -= 16
  page.drawText(`Títulos: ${style.typography.display}`, { x: M, y, size: 10, font: regular })
  y -= 14
  page.drawText(`Texto: ${style.typography.body}`, { x: M, y, size: 10, font: regular })

  if (input.audience.length) {
    y -= 26
    section(page, bold, 'Público', y)
    y -= 16
    page.drawText(fit(input.audience.join(' · '), regular, 10, inner), { x: M, y, size: 10, font: regular })
  }

  page.drawText('Generado con JR AI Hub', {
    x: M, y: M - 12, size: 7, font: regular, color: rgb(0.6, 0.6, 0.6),
  })

  return Buffer.from(await pdf.save())
}
