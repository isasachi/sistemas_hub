import type { ReactElement, ReactNode } from 'react'
import type { ThemeTokens } from '../theme'
import type { OfferCopy, OfferTier } from '../types'
import { GoldSeal, YapeLogo, MercadoPagoLogo, VisaLogo, MastercardLogo, FlagPE, FlagUS, goldGradient } from '../devices'

// Layout de composición de la sección OFERTA (motor híbrido). Formato ADN CLEARSTEM: la escena
// de Gemini trae el producto CHICO y centrado + el modelo en una esquina inferior; la
// composición arma un TRIÁNGULO — dos cards medianas a los lados del producto + una card grande
// abajo con la mejor promo — más un badge dorado sobre el producto, banner superior grande
// (con variación del color del nicho), título/subtítulo y la fila de pagos SIN glass. Glass real
// (Camino B): las cards embeben la escena pre-desenfocada alineada. Todo el texto sale de acá.

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
      boxShadow: featured ? '0 22px 54px rgba(0,0,0,0.44)' : '0 16px 40px rgba(0,0,0,0.34)',
    }}>
      <img src={blurBg} width={W} height={H} style={{ position: 'absolute', left: -x, top: -y, width: W, height: H, objectFit: 'cover' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.64), rgba(255,255,255,0.48))' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: 2, background: 'rgba(255,255,255,0.85)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: w, height: h }}>{children}</div>
    </div>
  )
}

function GoldRibbon({ label, t, size = 22 }: { label: string; t: ThemeTokens; size?: number }): ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 22px', borderRadius: 11,
      backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 700,
      fontSize: size, textTransform: 'uppercase', letterSpacing: 0.5, boxShadow: '0 5px 13px rgba(0,0,0,0.28)', border: '1px solid #fff3c4',
    }}>{label}</div>
  )
}

// Una card de oferta (mediana a los lados o grande abajo). Alturas de slot generosas para que
// respire (line-height adecuado, sin amontonar). `big` = la card featured, con tipografía mayor.
function TierCard(
  { tier, x, y, w, h, blurBg, t, big = false }:
  { tier: OfferTier; x: number; y: number; w: number; h: number; blurBg: string; t: ThemeTokens; big?: boolean },
): ReactElement {
  const rec = tier.featured
  const ribbon = rec ? (tier.badge ?? 'Recomendado') : typeof tier.savingsPct === 'number' ? `Ahorra ${tier.savingsPct}%` : null
  const ctaStyle = rec
    ? { backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', border: '1px solid #fff3c4' }
    : { background: t.accent, color: isLight(t.accent) ? t.textPrimary : '#fff', border: '1px solid rgba(255,255,255,0.25)' }
  const priceSize = big ? 104 : 66
  return (
    <GlassSurface x={x} y={y} w={w} h={h} blurBg={blurBg} t={t} featured={rec}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: w, height: h, padding: big ? '22px 16px' : '18px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: big ? 52 : 46 }}>{ribbon ? <GoldRibbon label={ribbon} t={t} size={big ? 26 : 21} /> : null}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: big ? 52 : 44 }}><span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: big ? 42 : 32, color: t.textPrimary, textAlign: 'center' }}>{tier.label}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: big ? 34 : 28 }}>{tier.priceBefore ? <span style={{ fontFamily: t.fonts.body, fontSize: big ? 30 : 24, color: t.textMuted, textDecoration: 'line-through' }}>Antes: {tier.priceBefore}</span> : null}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: priceSize + 6 }}><span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: priceSize, color: rec ? t.goldDark : t.textPrimary, lineHeight: 1 }}>{tier.price}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34 }}>{tier.perUnit ? <span style={{ fontFamily: t.fonts.body, fontSize: big ? 27 : 23, color: t.textMuted }}>{tier.perUnit}</span> : null}</div>
        <div style={{ display: 'flex', flex: 1 }} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: big ? 66 : 56, padding: big ? '0 64px' : '0 40px', borderRadius: 999,
          fontFamily: t.fonts.body, fontWeight: 700, fontSize: big ? 32 : 27, boxShadow: '0 8px 18px rgba(0,0,0,0.3)', ...ctaStyle,
        }}>{tier.cta}</div>
      </div>
    </GlassSurface>
  )
}

// Banner superior grande: placa dorada + sello circular EN EL COLOR DEL NICHO (la variación de
// esquema pedida) + dos líneas.
function TopBanner({ text, t }: { text: string; t: ThemeTokens }): ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '10px 42px 10px 10px', borderRadius: 22,
      backgroundImage: goldGradient(t.gold, t.goldDark), border: '2px solid #fff3c4', boxShadow: '0 12px 30px rgba(0,0,0,0.34)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 76, height: 76, borderRadius: 999, marginRight: 20,
        backgroundImage: `linear-gradient(150deg, ${t.accent}, ${t.accentSoft})`, background: t.accent, border: '3px solid #fffbe6', boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.4)',
      }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 22, color: isLight(t.accent) ? t.textPrimary : '#fff' }}>SOLO</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 24, color: '#6b4e12', letterSpacing: 1 }}>OFERTA EXCLUSIVA</span>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 36, color: '#3a2a05', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1.05 }}>{text}</span>
      </div>
    </div>
  )
}

export function OfertaLayout(
  { copy, theme: t, blurBg }: { copy: OfferCopy; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const MX = 30
  const featured = copy.tiers.find((tt) => tt.featured) ?? copy.tiers[copy.tiers.length - 1]
  const sides = copy.tiers.filter((tt) => tt !== featured).slice(0, 2)
  const maxSave = Math.max(0, ...copy.tiers.map((tt) => tt.savingsPct ?? 0))

  const sideW = 322, sideH = 384, sideY = 540
  const bigW = 744, bigH = 404, bigY = 1156, bigX = Math.round((W - bigW) / 2)
  const logos: ReactNode[] = [<YapeLogo key="y" />, <MercadoPagoLogo key="m" />, <VisaLogo key="v" />, <MastercardLogo key="c" />, <FlagPE key="pe" />, <FlagUS key="us" />]

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H }}>
      {/* Scrims: claro arriba (contraste header) y oscuro abajo (integra la card grande) */}
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: 470, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1080, width: W, height: 840, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.22) 55%, rgba(10,14,24,0.36) 100%)' }} />

      {/* Header: banner grande + título + eyebrow dorado */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 40, top: 42, width: W - 80 }}>
        {copy.urgency ? <TopBanner text={copy.urgency} t={t} /> : null}
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: copy.urgency ? 20 : 0 }}>
          <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 78, color: t.textPrimary, textAlign: 'center', lineHeight: 1.02, letterSpacing: -1 }}>{copy.headline}</span>
        </div>
        {copy.subheadline ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 12, gap: 14 }}>
            <div style={{ display: 'flex', width: 44, height: 3, background: t.goldDark, borderRadius: 2 }} />
            <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 27, color: t.goldDark, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, maxWidth: 680 }}>{copy.subheadline}</span>
            <div style={{ display: 'flex', width: 44, height: 3, background: t.goldDark, borderRadius: 2 }} />
          </div>
        ) : null}
      </div>

      {/* Badge dorado sobre el producto (promo: mayor ahorro) */}
      {maxSave > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', position: 'absolute', left: 0, top: 388, width: W }}>
          <GoldRibbon label={`Hasta ${maxSave}% OFF`} t={t} size={30} />
        </div>
      ) : null}

      {/* Dos cards medianas a los lados del producto (triángulo) */}
      {sides[0] ? <TierCard tier={sides[0]} x={MX} y={sideY} w={sideW} h={sideH} blurBg={blurBg} t={t} /> : null}
      {sides[1] ? <TierCard tier={sides[1]} x={W - MX - sideW} y={sideY} w={sideW} h={sideH} blurBg={blurBg} t={t} /> : null}

      {/* Card grande abajo con la mejor promo */}
      <TierCard tier={featured} x={bigX} y={bigY} w={bigW} h={bigH} blurBg={blurBg} t={t} big />

      {/* Fila de pagos SIN glass — logos directos sobre la escena */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 0, top: 1668, width: W, gap: 16 }}>
        {logos}
        <div style={{ display: 'flex', marginLeft: 8 }}><GoldSeal label="Garantía" gold={t.gold} goldDark={t.goldDark} size={78} /></div>
      </div>
    </div>
  )
}
