import type { ReactElement, ReactNode } from 'react'
import type { ThemeTokens } from '../theme'
import type { OfferCopy, OfferTier } from '../types'
import {
  GoldRibbon, SavingsRibbon,
  YapeLogo, MercadoPagoLogo, VisaLogo, MastercardLogo, FlagPE, FlagUS,
} from '../devices'

// Layout de composición de la sección OFERTA (motor híbrido). GLASS REAL (Camino B): las cards
// se posicionan en ABSOLUTO y embeben la escena PRE-DESENFOCADA (`blurBg`) con offset negativo
// igual a su posición → el recorte borroso coincide con lo que hay detrás = frosted glass real
// (Satori no soporta backdrop-filter). Cards SIMÉTRICAS (mismo tamaño/estructura/posición); el
// featured se distingue por corona dorada + borde + CTA, no por tamaño. Headline grande, sin
// espacio muerto. Todo el texto sale de acá, nunca de la IA.

const W = 1080, H = 1920

function isLight(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62
}

// Superficie de glass real: recorte desenfocado de la escena + velo blanco (contraste) + borde
// superior claro. `blurBg` = data URI 1080×1920 de la escena borrosa (mismo cover que el fondo).
function GlassSurface(
  { x, y, w, h, blurBg, t, featured = false, radius = 26, children }:
  { x: number; y: number; w: number; h: number; blurBg: string; t: ThemeTokens; featured?: boolean; radius?: number; children: ReactNode },
): ReactElement {
  return (
    <div style={{
      display: 'flex', position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius, overflow: 'hidden',
      border: featured ? `2px solid ${t.gold}` : '1px solid rgba(255,255,255,0.55)',
      boxShadow: featured ? '0 22px 52px rgba(0,0,0,0.42)' : '0 16px 38px rgba(0,0,0,0.32)',
    }}>
      <img src={blurBg} width={W} height={H} style={{ position: 'absolute', left: -x, top: -y, width: W, height: H, objectFit: 'cover' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.60), rgba(255,255,255,0.44))' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: 2, background: 'rgba(255,255,255,0.85)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: w, height: h }}>{children}</div>
    </div>
  )
}

// Slot de altura fija → los precios/CTAs quedan alineados entre cards (simetría de composición).
function Slot({ h, children }: { h: number; children?: ReactNode }): ReactElement {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: h }}>{children}</div>
}

function TierCard(
  { tier, x, y, w, h, blurBg, t }:
  { tier: OfferTier; x: number; y: number; w: number; h: number; blurBg: string; t: ThemeTokens },
): ReactElement {
  const rec = tier.featured
  const ctaStyle = rec
    ? { backgroundImage: `linear-gradient(145deg, ${t.gold}, ${t.goldDark})`, color: '#3a2a05' }
    : { background: t.accent, color: isLight(t.accent) ? t.textPrimary : '#fff' }
  return (
    <GlassSurface x={x} y={y} w={w} h={h} blurBg={blurBg} t={t} featured={rec}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: w, height: h, padding: '20px 12px 18px' }}>
        {/* Badge del featured DENTRO de la card (slot reservado en todas → simetría, sin
            colisión con el producto que tenía la corona externa). */}
        <Slot h={40}>{rec ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 16px', borderRadius: 999, backgroundImage: `linear-gradient(145deg, ${t.gold}, ${t.goldDark})`, color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 700, fontSize: 20, textTransform: 'uppercase', letterSpacing: 0.5, boxShadow: '0 4px 10px rgba(0,0,0,0.22)' }}>{tier.badge ?? 'Recomendado'}</div>
        ) : null}</Slot>
        <Slot h={44}><span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 32, color: t.textPrimary, textAlign: 'center' }}>{tier.label}</span></Slot>
        <Slot h={26}>{tier.priceBefore ? <span style={{ fontFamily: t.fonts.body, fontSize: 24, color: t.textMuted, textDecoration: 'line-through' }}>Antes: {tier.priceBefore}</span> : null}</Slot>
        <Slot h={76}><span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 66, color: t.textPrimary, lineHeight: 1 }}>{tier.price}</span></Slot>
        <Slot h={42}>{typeof tier.savingsPct === 'number' ? <SavingsRibbon label={`Ahorra ${tier.savingsPct}%`} gold={t.gold} goldDark={t.goldDark} /> : null}</Slot>
        <Slot h={28}>{tier.perUnit ? <span style={{ fontFamily: t.fonts.body, fontSize: 24, color: t.textMuted }}>{tier.perUnit}</span> : null}</Slot>
        <div style={{ display: 'flex', flex: 1 }} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 58, borderRadius: 999,
          fontFamily: t.fonts.body, fontWeight: 700, fontSize: 27, boxShadow: '0 8px 18px rgba(0,0,0,0.28)', ...ctaStyle,
        }}>{tier.cta}</div>
      </div>
    </GlassSurface>
  )
}

export function OfertaLayout(
  { copy, theme: t, blurBg }: { copy: OfferCopy; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const n = copy.tiers.length
  const MX = 38, GAP = 15
  const cardW = Math.round((W - 2 * MX - (n - 1) * GAP) / n)
  const cardH = 408
  const payH = 92, payY = H - 36 - payH
  const cardsY = payY - 20 - cardH
  const cardX = (i: number) => MX + i * (cardW + GAP)

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H }}>
      {/* Scrim superior: ground claro para que el header oscuro lea sobre cualquier escena */}
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: 470, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)' }} />
      {/* Scrim inferior: asienta las cards en la escena (integración, no "pegado encima") */}
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1120, width: W, height: 800, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.26) 55%, rgba(10,14,24,0.40) 100%)' }} />

      {/* Header anclado arriba: urgencia + headline GRANDE + subheadline legible */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 60, top: 54, width: W - 120 }}>
        {copy.urgency ? <GoldRibbon label={copy.urgency} gold={t.gold} goldDark={t.goldDark} /> : null}
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: copy.urgency ? 22 : 0 }}>
          <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 82, color: t.textPrimary, textAlign: 'center', lineHeight: 1.02, letterSpacing: -1 }}>{copy.headline}</span>
        </div>
        {copy.subheadline ? (
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: 16 }}>
            <span style={{ fontFamily: t.fonts.body, fontWeight: 700, fontSize: 36, color: t.textPrimary, textAlign: 'center', maxWidth: 840 }}>{copy.subheadline}</span>
          </div>
        ) : null}
      </div>

      {/* Fila de tiers SIMÉTRICOS en glass real (el featured se distingue por badge interno,
          borde y CTA dorados — no por tamaño ni posición) */}
      {copy.tiers.map((tier, i) => (
        <TierCard key={i} tier={tier} x={cardX(i)} y={cardsY} w={cardW} h={cardH} blurBg={blurBg} t={t} />
      ))}

      {/* Strip de pagos, también glass real */}
      <GlassSurface x={MX} y={payY} w={W - 2 * MX} h={payH} blurBg={blurBg} t={t} radius={22}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', gap: 16 }}>
          <YapeLogo /><MercadoPagoLogo /><VisaLogo /><MastercardLogo />
          <div style={{ display: 'flex', gap: 8, marginLeft: 6 }}><FlagPE /><FlagUS /></div>
        </div>
      </GlassSurface>
    </div>
  )
}
