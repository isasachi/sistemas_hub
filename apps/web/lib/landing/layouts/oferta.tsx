import type { ReactElement, ReactNode } from 'react'
import type { ThemeTokens } from '../theme'
import type { Offer, OfferCopy, OfferTier } from '../types'
import { GoldSeal, YapeLogo, MercadoPagoLogo, VisaLogo, MastercardLogo, FlagPE, FlagUS, goldGradient } from '../devices'

// Layout de composición de la sección OFERTA (motor híbrido). Formato ADN CLEARSTEM, con el
// método proporcional: hay UNA card base y la card destacada es esa misma card × k — TODO
// escala por el mismo factor (ancho, alto, radio, padding, tipografías, botón, borde), y las
// tres cards comparten EXACTAMENTE la misma estructura de 6 filas. Así se lee como jerarquía y
// no como formas distintas. La escena (Gemini) trae el producto chico+centrado + el modelo en
// una esquina; la composición arma el triángulo (2 cards a los lados + 1 grande abajo, más
// angosta para NO pisar al modelo), badge sobre el producto y pagos SIN glass. Glass real
// (Camino B): las cards embeben la escena pre-desenfocada alineada. Todo el texto sale de acá.

const W = 1080, H = 1920
const SHADOW = '0 20px 44px rgba(14,40,88,0.22)'   // sombra navy del ADN
const SHADOW_F = '0 26px 56px rgba(14,40,88,0.34)'  // featured, más fuerte

function isLight(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62
}

// Vidrio real (Camino B): recorte desenfocado de la escena + velo blanco + borde superior claro.
function GlassSurface(
  { x, y, w, h, blurBg, radius, bw, borderColor, shadow, children }:
  { x: number; y: number; w: number; h: number; blurBg: string; radius: number; bw: number; borderColor: string; shadow: string; children: ReactNode },
): ReactElement {
  return (
    <div style={{
      display: 'flex', position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius, overflow: 'hidden',
      border: `${bw}px solid ${borderColor}`, boxShadow: shadow,
    }}>
      <img src={blurBg} width={W} height={H} style={{ position: 'absolute', left: -x, top: -y, width: W, height: H, objectFit: 'cover' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: h, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.66), rgba(255,255,255,0.50))' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: 2, background: 'rgba(255,255,255,0.85)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: w, height: h }}>{children}</div>
    </div>
  )
}

function Ribbon({ label, t, fs }: { label: string; t: ThemeTokens; fs: number }): ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${fs * 0.36}px ${fs}px`, borderRadius: fs * 0.5,
      backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 800,
      fontSize: fs, textTransform: 'uppercase', letterSpacing: 0.5, boxShadow: '0 5px 13px rgba(0,0,0,0.28)', border: '1px solid #fff3c4',
    }}>{label}</div>
  )
}

// UNA card, derivada de un ancho base `u` (todo escala proporcional a u → sistema de factor
// único). Cards laterales u=BASE; la destacada u=BASE·1.4. Estructura IDÉNTICA de 6 filas en
// todas: cinta / cantidad / precio-antes / línea / precio / botón / detalle.
function Card(
  { tier, x, y, u, blurBg, t }:
  { tier: OfferTier; x: number; y: number; u: number; blurBg: string; t: ThemeTokens },
): ReactElement {
  const rec = tier.featured
  const p = (frac: number) => u * frac
  const ribbon = rec ? (tier.badge ?? 'Recomendado') : typeof tier.savingsPct === 'number' ? `Ahorra ${tier.savingsPct}%` : null
  const [cur, ...rest] = tier.price.trim().split(/\s+/)
  const num = rest.join(' ') || cur
  const hasCur = rest.length > 0
  const ctaStyle = rec
    ? { backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', border: '1px solid #fff3c4' }
    : { background: t.accent, color: isLight(t.accent) ? t.textPrimary : '#fff', border: '1px solid rgba(255,255,255,0.25)' }

  return (
    <GlassSurface x={x} y={y} w={u} h={p(1.24)} blurBg={blurBg} radius={p(0.073)} bw={Math.max(1.5, p(rec ? 0.008 : 0.005))}
      borderColor={rec ? t.gold : 'rgba(255,255,255,0.55)'} shadow={rec ? SHADOW_F : SHADOW}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', width: u, height: p(1.24), padding: `${p(0.06)}px ${p(0.045)}px ${p(0.055)}px` }}>
        <div style={{ display: 'flex', height: p(0.13), alignItems: 'center' }}>{ribbon ? <Ribbon label={ribbon} t={t} fs={p(0.066)} /> : null}</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p(0.013) }}>
          <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: p(0.112), color: t.textPrimary, textAlign: 'center' }}>{tier.label}</span>
          {tier.priceBefore ? <span style={{ fontFamily: t.fonts.body, fontSize: p(0.066), color: t.textMuted, textDecoration: 'line-through' }}>Antes: {tier.priceBefore}</span> : null}
          <div style={{ display: 'flex', width: p(0.5), height: Math.max(2, p(0.006)), background: 'rgba(0,0,0,0.14)', borderRadius: 2, margin: `${p(0.01)}px 0` }} />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            {hasCur ? <span style={{ fontFamily: t.fonts.display, fontWeight: 900, fontSize: p(0.145), color: rec ? t.goldDark : t.textPrimary, marginRight: p(0.013), marginBottom: p(0.026) }}>{cur}</span> : null}
            <span style={{ fontFamily: t.fonts.display, fontWeight: 900, fontSize: p(0.25), color: rec ? t.goldDark : t.textPrimary, lineHeight: 1 }}>{num}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p(0.026) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: p(0.68), height: p(0.172), borderRadius: 999, fontFamily: t.fonts.body, fontWeight: 700, fontSize: p(0.086), boxShadow: '0 8px 18px rgba(0,0,0,0.3)', ...ctaStyle }}>{tier.cta}</div>
          <div style={{ display: 'flex', height: p(0.075), alignItems: 'center' }}>{tier.perUnit ? <span style={{ fontFamily: t.fonts.body, fontSize: p(0.056), color: t.textMuted }}>{tier.perUnit}</span> : null}</div>
        </div>
      </div>
    </GlassSurface>
  )
}

// Corona sobre el producto: topper "Recomendado" + placa dorada grande con la mejor promo.
function Crown({ label, t }: { label: string; t: ThemeTokens }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 22px', borderRadius: 999, backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 800, fontSize: 20, textTransform: 'uppercase', letterSpacing: 1.5, boxShadow: '0 5px 12px rgba(0,0,0,0.28)', border: '1px solid #fff3c4', marginBottom: -6 }}>Recomendado</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 44px', borderRadius: 16, backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 800, fontSize: 44, letterSpacing: 0.5, boxShadow: '0 10px 24px rgba(0,0,0,0.32)', border: '2px solid #fff3c4' }}>{label}</div>
    </div>
  )
}

// Banner superior GRANDE: placa dorada ancha + sello circular EN EL COLOR DEL NICHO.
function TopBanner({ text, t }: { text: string; t: ThemeTokens }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 56px 12px 12px', borderRadius: 26, backgroundImage: goldGradient(t.gold, t.goldDark), border: '2px solid #fff3c4', boxShadow: '0 14px 34px rgba(0,0,0,0.36)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 88, height: 88, borderRadius: 999, marginRight: 24, background: t.accent, border: '3px solid #fffbe6', boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.4)' }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 25, color: isLight(t.accent) ? t.textPrimary : '#fff' }}>SOLO</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 28, color: '#6b4e12', letterSpacing: 1 }}>OFERTA EXCLUSIVA</span>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 900, fontSize: 44, color: '#3a2a05', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1.05 }}>{text}</span>
      </div>
    </div>
  )
}

export function OfertaLayout(
  { offer, copy, theme: t, blurBg }: { offer: Offer; copy: OfferCopy; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const featured = offer.tiers.find((tt) => tt.featured) ?? offer.tiers[offer.tiers.length - 1]
  const sides = offer.tiers.filter((tt) => tt !== featured).slice(0, 2)
  const maxSave = Math.max(0, ...offer.tiers.map((tt) => tt.savingsPct ?? 0))

  // Sistema de factor único. Base medido del reference: laterales ~33% ancho, central ~46%
  // (relación 1.4). Posiciones en % del lienzo medidas sobre el reference CLEARSTEM.
  const BASE = 352, K = 1.4
  const sideY = 596, sideL = 48, sideR = W - 48 - BASE
  const cU = Math.round(BASE * K), cX = Math.round((W - cU) / 2), cY = 1086
  const logos: ReactNode[] = [<YapeLogo key="y" />, <MercadoPagoLogo key="m" />, <VisaLogo key="v" />, <MastercardLogo key="c" />, <FlagPE key="pe" />, <FlagUS key="us" />]

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: 470, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1020, width: W, height: 900, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.22) 55%, rgba(10,14,24,0.36) 100%)' }} />

      {/* Header: banner grande + título + eyebrow dorado */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 30, top: 40, width: W - 60 }}>
        {offer.urgency ? <TopBanner text={offer.urgency} t={t} /> : null}
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: offer.urgency ? 18 : 0 }}>
          <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 80, color: t.textPrimary, textAlign: 'center', lineHeight: 1.02, letterSpacing: -1 }}>{copy.headline}</span>
        </div>
        {copy.subheadline ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 12, gap: 14 }}>
            <div style={{ display: 'flex', width: 46, height: 3, background: t.goldDark, borderRadius: 2 }} />
            <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 28, color: t.goldDark, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, maxWidth: 700 }}>{copy.subheadline}</span>
            <div style={{ display: 'flex', width: 46, height: 3, background: t.goldDark, borderRadius: 2 }} />
          </div>
        ) : null}
      </div>

      {/* Corona dorada grande sobre el producto (mejor promo) */}
      {maxSave > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', position: 'absolute', left: 0, top: 470, width: W }}>
          <Crown label={`Hasta ${maxSave}% OFF`} t={t} />
        </div>
      ) : null}

      {/* Dos cards base (u=BASE) a los lados del producto */}
      {sides[0] ? <Card tier={sides[0]} x={sideL} y={sideY} u={BASE} blurBg={blurBg} t={t} /> : null}
      {sides[1] ? <Card tier={sides[1]} x={sideR} y={sideY} u={BASE} blurBg={blurBg} t={t} /> : null}

      {/* Card central = base × K, ancha y centrada (el modelo va abajo-izquierda) */}
      <Card tier={featured} x={cX} y={cY} u={cU} blurBg={blurBg} t={t} />

      {/* Fila de pagos SIN glass — logos directos sobre la escena */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 0, top: 1772, width: W, gap: 16 }}>
        {logos}
        <div style={{ display: 'flex', marginLeft: 8 }}><GoldSeal label="Garantía" gold={t.gold} goldDark={t.goldDark} size={78} /></div>
      </div>
    </div>
  )
}
