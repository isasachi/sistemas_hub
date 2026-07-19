import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import type { Offer, TrustBlock } from '../types'
import { TruckIcon, CheckDisc, ShieldIcon, goldGradient } from '../devices'

// Partes de composición compartidas por varios layouts híbridos (hero, cta-final, …). Todas
// theme-driven (nada hardcodeado a CLEARSTEM) y pensadas para el lienzo 1080×1920.

// Eyebrow dorado con guiones a los lados (ADN: "— AHORROS Y RESULTADOS REALES —").
export function Eyebrow({ label, t }: { label: string; t: ThemeTokens }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ display: 'flex', width: 40, height: 3, background: t.goldDark, borderRadius: 2 }} />
      <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 26, color: t.goldDark, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      <div style={{ display: 'flex', width: 40, height: 3, background: t.goldDark, borderRadius: 2 }} />
    </div>
  )
}

// Encabezado de sección: headline (con una palabra-acento opcional en color de marca) + subhead.
export function SectionHeader(
  { headline, subheadline, accent, t, align = 'left', width = 900, size = 66 }:
  { headline: string; subheadline?: string; accent?: string; t: ThemeTokens; align?: 'left' | 'center'; width?: number; size?: number },
): ReactElement {
  // Resalta `accent` (substring del headline) en color de marca, como el ADN.
  let head: ReactElement
  if (accent && headline.toLowerCase().includes(accent.toLowerCase())) {
    const i = headline.toLowerCase().indexOf(accent.toLowerCase())
    // nbsp en los bordes: Satori recorta el whitespace al final/inicio de un <span> inline, así
    // que la palabra-acento se pegaría a la anterior/siguiente. El   preserva el espacio.
    const before = headline.slice(0, i).replace(/ $/, ' '), mid = headline.slice(i, i + accent.length), after = headline.slice(i + accent.length).replace(/^ /, ' ')
    head = (
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: size, color: t.textPrimary, lineHeight: 1.04, letterSpacing: -1 }}>{before}</span>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: size, color: t.accent, lineHeight: 1.04, letterSpacing: -1 }}>{mid}</span>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: size, color: t.textPrimary, lineHeight: 1.04, letterSpacing: -1 }}>{after}</span>
      </div>
    )
  } else {
    head = <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: size, color: t.textPrimary, lineHeight: 1.04, letterSpacing: -1, textAlign: align }}>{headline}</span>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', width }}>
      {head}
      {subheadline ? <span style={{ fontFamily: t.fonts.body, fontSize: 30, color: t.textMuted, marginTop: 12, textAlign: align, maxWidth: width }}>{subheadline}</span> : null}
    </div>
  )
}

// Placa de precio navy: "Paquete <label> / ¡<precio> HOY!" (ADN hero/cta-final). Del tier destacado.
export function PricePlaque({ offer, t }: { offer: Offer | null; t: ThemeTokens }): ReactElement | null {
  const f = offer?.tiers.find((tt) => tt.featured) ?? offer?.tiers[offer.tiers.length - 1]
  if (!f) return null
  const [cur, ...rest] = f.price.trim().split(/\s+/)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 40px', borderRadius: 24, background: t.textPrimary, boxShadow: '0 16px 34px rgba(14,40,88,0.34)' }}>
      <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 30, color: '#fff' }}>Paquete {f.label}</span>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 900, fontSize: 40, color: t.gold, marginRight: 6, marginBottom: 10 }}>¡{cur}</span>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 900, fontSize: 72, color: t.gold, lineHeight: 1 }}>{rest.join(' ')}</span>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 900, fontSize: 40, color: '#fff', marginLeft: 12, marginBottom: 10 }}>HOY!</span>
      </div>
    </div>
  )
}

// Strip de confianza: hasta 3 mini-pills (Envío / Pago / Compra) del TrustBlock. ADN hero/cta-final.
export function TrustStrip({ trust, t, width = 960 }: { trust: TrustBlock | null; t: ThemeTokens; width?: number }): ReactElement | null {
  if (!trust) return null
  const items: { icon: ReactElement; top: string; bottom: string }[] = []
  if (trust.deliveryTime) items.push({ icon: <TruckIcon color={t.accent} size={34} />, top: 'Envío', bottom: trust.deliveryTime })
  if (trust.codDelivery) items.push({ icon: <CheckDisc symbol="$" accent="#16a34a" size={40} />, top: 'Pago', bottom: 'Contraentrega' })
  if (trust.guaranteeDays || trust.paymentMethods.length) items.push({ icon: <ShieldIcon color={t.accent} size={34} />, top: 'Compra', bottom: '100% Segura' })
  const show = items.slice(0, 3)
  if (!show.length) return null
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 14, width }}>
      {show.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, padding: '14px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 8px 20px rgba(14,40,88,0.14)' }}>
          <div style={{ display: 'flex' }}>{it.icon}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 22, color: t.textPrimary, lineHeight: 1.1 }}>{it.top}</span>
            <span style={{ fontFamily: t.fonts.body, fontSize: 18, color: t.textMuted, lineHeight: 1.1 }}>{it.bottom}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
