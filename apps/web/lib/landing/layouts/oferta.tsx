import type { ReactElement, ReactNode } from 'react'
import type { ThemeTokens } from '../theme'
import type { OfferCopy, OfferTier } from '../types'
import { GoldSeal, YapeLogo, MercadoPagoLogo, VisaLogo, MastercardLogo, FlagPE, FlagUS, goldGradient } from '../devices'

// Layout de composición de la sección OFERTA (motor híbrido). GLASS REAL (Camino B): las cards
// se posicionan en ABSOLUTO y embeben la escena PRE-DESENFOCADA (`blurBg`) con offset negativo
// igual a su posición → frosted glass real (Satori no soporta backdrop-filter). Cards SIMÉTRICAS
// y POBLADAS (ribbon dorado + antes tachado + precio grande + costo/unidad), CTA angosto (no
// full-width), banner superior con sello, oro metálico agresivo. Estética del ADN CLEARSTEM.

const W = 1080, H = 1920

function isLight(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62
}

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
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.46))' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: 2, background: 'rgba(255,255,255,0.85)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: w, height: h }}>{children}</div>
    </div>
  )
}

function Slot({ h, children }: { h: number; children?: ReactNode }): ReactElement {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: h }}>{children}</div>
}

// Ribbon dorado del tope de cada card: badge del featured, o "Ahorra X%" del resto → todas las
// cards nacen con un elemento dorado que resalta (pobladas, como el ADN).
function CardRibbon({ label, t }: { label: string; t: ThemeTokens }): ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 20px', borderRadius: 11,
      backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 700,
      fontSize: 22, textTransform: 'uppercase', letterSpacing: 0.5, boxShadow: '0 5px 13px rgba(0,0,0,0.28)', border: '1px solid #fff3c4',
    }}>{label}</div>
  )
}

function TierCard(
  { tier, x, y, w, h, blurBg, t }:
  { tier: OfferTier; x: number; y: number; w: number; h: number; blurBg: string; t: ThemeTokens },
): ReactElement {
  const rec = tier.featured
  const ribbon = rec ? (tier.badge ?? 'Recomendado') : typeof tier.savingsPct === 'number' ? `Ahorra ${tier.savingsPct}%` : null
  const ctaStyle = rec
    ? { backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', border: '1px solid #fff3c4' }
    : { background: t.accent, color: isLight(t.accent) ? t.textPrimary : '#fff', border: '1px solid rgba(255,255,255,0.25)' }
  return (
    <GlassSurface x={x} y={y} w={w} h={h} blurBg={blurBg} t={t} featured={rec}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: w, height: h, padding: '18px 12px 18px' }}>
        <Slot h={44}>{ribbon ? <CardRibbon label={ribbon} t={t} /> : null}</Slot>
        <Slot h={42}><span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 32, color: t.textPrimary, textAlign: 'center' }}>{tier.label}</span></Slot>
        <Slot h={28}>{tier.priceBefore ? <span style={{ fontFamily: t.fonts.body, fontSize: 24, color: t.textMuted, textDecoration: 'line-through' }}>Antes: {tier.priceBefore}</span> : null}</Slot>
        <Slot h={78}><span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 68, color: rec ? t.goldDark : t.textPrimary, lineHeight: 1 }}>{tier.price}</span></Slot>
        <Slot h={30}>{tier.perUnit ? <span style={{ fontFamily: t.fonts.body, fontSize: 23, color: t.textMuted }}>{tier.perUnit}</span> : null}</Slot>
        <div style={{ display: 'flex', flex: 1 }} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: 58, padding: '0 40px', borderRadius: 999,
          fontFamily: t.fonts.body, fontWeight: 700, fontSize: 27, boxShadow: '0 8px 18px rgba(0,0,0,0.3)', ...ctaStyle,
        }}>{tier.cta}</div>
      </div>
    </GlassSurface>
  )
}

// Banner de urgencia rico: sello circular + placa dorada de dos líneas (ADN CLEARSTEM).
function UrgencyBanner({ text, t }: { text: string; t: ThemeTokens }): ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '8px 36px 8px 8px', borderRadius: 20,
      backgroundImage: goldGradient(t.gold, t.goldDark), border: '2px solid #fff3c4', boxShadow: '0 10px 26px rgba(0,0,0,0.32)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 68, height: 68, borderRadius: 999, marginRight: 18,
        backgroundImage: goldGradient(t.gold, t.goldDark), border: '3px solid #fffbe6', boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.4)',
      }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 22, color: '#3a2a05' }}>SOLO</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 22, color: '#6b4e12', letterSpacing: 1 }}>OFERTA EXCLUSIVA</span>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 32, color: '#3a2a05', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1.05 }}>{text}</span>
      </div>
    </div>
  )
}

export function OfertaLayout(
  { copy, theme: t, blurBg }: { copy: OfferCopy; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const n = copy.tiers.length
  const MX = 34, GAP = 14
  const cardW = Math.round((W - 2 * MX - (n - 1) * GAP) / n)
  const cardH = 372
  const payH = 88, payY = H - 30 - payH
  const cardsY = payY - 18 - cardH
  const cardX = (i: number) => MX + i * (cardW + GAP)

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H }}>
      {/* Scrims: claro arriba (contraste del header), oscuro abajo (integra las cards) */}
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: 490, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1120, width: W, height: 800, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.26) 55%, rgba(10,14,24,0.40) 100%)' }} />

      {/* Header: banner + headline GRANDE + eyebrow dorado */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 50, top: 46, width: W - 100 }}>
        {copy.urgency ? <UrgencyBanner text={copy.urgency} t={t} /> : null}
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: copy.urgency ? 22 : 0 }}>
          <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 82, color: t.textPrimary, textAlign: 'center', lineHeight: 1.02, letterSpacing: -1 }}>{copy.headline}</span>
        </div>
        {copy.subheadline ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 14, gap: 14 }}>
            <div style={{ display: 'flex', width: 46, height: 3, background: t.goldDark, borderRadius: 2 }} />
            <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 28, color: t.goldDark, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, maxWidth: 700 }}>{copy.subheadline}</span>
            <div style={{ display: 'flex', width: 46, height: 3, background: t.goldDark, borderRadius: 2 }} />
          </div>
        ) : null}
      </div>

      {/* Cards SIMÉTRICAS y pobladas en glass real */}
      {copy.tiers.map((tier, i) => (
        <TierCard key={i} tier={tier} x={cardX(i)} y={cardsY} w={cardW} h={cardH} blurBg={blurBg} t={t} />
      ))}

      {/* Strip de pagos (logos + banderas a la izquierda, sello de garantía inline a la derecha) */}
      <GlassSurface x={MX} y={payY} w={W - 2 * MX} h={payH} blurBg={blurBg} t={t} radius={20}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', padding: '0 22px 0 28px', gap: 15 }}>
          <YapeLogo /><MercadoPagoLogo /><VisaLogo /><MastercardLogo />
          <div style={{ display: 'flex', gap: 8, marginLeft: 6 }}><FlagPE /><FlagUS /></div>
          <div style={{ display: 'flex', flex: 1 }} />
          <GoldSeal label="Garantía" gold={t.gold} goldDark={t.goldDark} size={70} />
        </div>
      </GlassSurface>
    </div>
  )
}
