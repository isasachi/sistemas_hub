import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import { CW } from './glass'

// Lockup de marca (goal 2026-07-18, tarea 4): un wordmark de marca CRUJIENTE, más allá del label
// impreso en el frasco. Se compone con Satori (texto nítido, tipografía de marca) en vez de dejar
// que la difusión lo dibuje — misma lección que los logos de pago: la difusión garabatea wordmarks.
// Overlay de canvas completo con el lockup anclado arriba-centro. Solo hero y cta-final (presencia
// de marca natural), no las 8 secciones. Acabado metálico: gold sobre goldDark con highlight.

export function BrandLockup(
  { text, theme: t }: { text: string; theme: ThemeTokens },
): ReactElement {
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14,
        position: 'absolute', left: 0, top: 40, width: CW, height: 60,
      }}>
        <div style={{ display: 'flex', width: 46, height: 3, backgroundImage: `linear-gradient(90deg, ${t.gold}00, ${t.goldDark})` }} />
        <span style={{
          fontFamily: t.fonts.display, fontWeight: 800, fontSize: 34, color: t.goldDark,
          textTransform: 'uppercase', letterSpacing: 5,
          textShadow: `0 1px 0 ${t.gold}`,
        }}>{text}</span>
        <div style={{ display: 'flex', width: 46, height: 3, backgroundImage: `linear-gradient(90deg, ${t.goldDark}, ${t.gold}00)` }} />
      </div>
    </div>
  )
}

// Deriva el texto del lockup: preferimos la 1ª línea del label impreso (el wordmark real, p.ej.
// "CLEARSTEM"), si es corta; luego el product_name; null si no hay un candidato limpio y corto.
// Un product_name largo ("Colágeno Hidrolizado Marino") NO lee como lockup → lo saltamos.
export function brandLockupText(productLabels?: string | null, productName?: string | null): string | null {
  const firstLabel = productLabels?.split('\n').map((s) => s.trim()).find(Boolean)
  const name = productName?.trim()
  for (const cand of [firstLabel, name]) {
    if (cand && cand.length <= 18 && cand.split(/\s+/).length <= 2) return cand
  }
  return null
}
