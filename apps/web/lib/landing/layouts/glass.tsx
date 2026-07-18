import type { ReactElement, ReactNode } from 'react'

// Helpers de composición compartidos por los layouts híbridos (oferta / garantía / cta-final).
// Todos componen sobre un lienzo 1080×1920. Glass real (Camino B): Satori no soporta
// backdrop-filter, así que cada superficie embebe la escena PRE-DESENFOCADA con un offset
// negativo igual a su posición → el recorte desenfocado queda alineado bajo un velo blanco.

export const CW = 1080, CH = 1920

export function isLight(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62
}

export function GlassSurface(
  { x, y, w, h, blurBg, radius, bw, borderColor, shadow, children }:
  { x: number; y: number; w: number; h: number; blurBg: string; radius: number; bw: number; borderColor: string; shadow: string; children: ReactNode },
): ReactElement {
  return (
    <div style={{
      display: 'flex', position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius, overflow: 'hidden',
      border: `${bw}px solid ${borderColor}`, boxShadow: shadow,
    }}>
      <img src={blurBg} width={CW} height={CH} style={{ position: 'absolute', left: -x, top: -y, width: CW, height: CH, objectFit: 'cover' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.66), rgba(255,255,255,0.50))' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: 2, background: 'rgba(255,255,255,0.85)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: w, height: h }}>{children}</div>
    </div>
  )
}
