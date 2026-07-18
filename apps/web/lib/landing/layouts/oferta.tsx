import type { ReactElement, ReactNode } from 'react'
import type { ThemeTokens } from '../theme'
import type { OfferCopy, OfferTier } from '../types'
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
      backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 700,
      fontSize: fs, textTransform: 'uppercase', letterSpacing: 0.5, boxShadow: '0 5px 13px rgba(0,0,0,0.28)', border: '1px solid #fff3c4',
    }}>{label}</div>
  )
}

// UNA card, escalada por `k`. Base (k=1) = 300×372; la featured usa k=1.4. Estructura idéntica
// de 6 filas en todas: cinta / cantidad / precio-antes / línea / precio / botón / detalle.
function Card(
  { tier, x, y, k, blurBg, t }:
  { tier: OfferTier; x: number; y: number; k: number; blurBg: string; t: ThemeTokens },
): ReactElement {
  const rec = tier.featured
  const p = (v: number) => v * k
  const ribbon = rec ? (tier.badge ?? 'Recomendado') : typeof tier.savingsPct === 'number' ? `Ahorra ${tier.savingsPct}%` : null
  const [cur, ...rest] = tier.price.trim().split(/\s+/)
  const num = rest.join(' ') || cur
  const hasCur = rest.length > 0
  const ctaStyle = rec
    ? { backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', border: '1px solid #fff3c4' }
    : { background: t.accent, color: isLight(t.accent) ? t.textPrimary : '#fff', border: '1px solid rgba(255,255,255,0.25)' }

  return (
    <GlassSurface x={x} y={y} w={p(300)} h={p(372)} blurBg={blurBg} radius={p(22)} bw={p(rec ? 2.5 : 1.5)}
      borderColor={rec ? t.gold : 'rgba(255,255,255,0.55)'} shadow={rec ? SHADOW_F : SHADOW}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', width: p(300), height: p(372), padding: `${p(20)}px ${p(14)}px ${p(18)}px` }}>
        <div style={{ display: 'flex', height: p(40), alignItems: 'center' }}>{ribbon ? <Ribbon label={ribbon} t={t} fs={p(20)} /> : null}</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p(4) }}>
          <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: p(34), color: t.textPrimary, textAlign: 'center' }}>{tier.label}</span>
          {tier.priceBefore ? <span style={{ fontFamily: t.fonts.body, fontSize: p(20), color: t.textMuted, textDecoration: 'line-through' }}>Antes: {tier.priceBefore}</span> : null}
          <div style={{ display: 'flex', width: p(150), height: p(2), background: 'rgba(0,0,0,0.14)', borderRadius: 2, margin: `${p(3)}px 0` }} />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            {hasCur ? <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: p(44), color: rec ? t.goldDark : t.textPrimary, marginRight: p(4), marginBottom: p(8) }}>{cur}</span> : null}
            <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: p(76), color: rec ? t.goldDark : t.textPrimary, lineHeight: 1 }}>{num}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: p(8) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: p(206), height: p(52), borderRadius: 999, fontFamily: t.fonts.body, fontWeight: 700, fontSize: p(26), boxShadow: '0 8px 18px rgba(0,0,0,0.3)', ...ctaStyle }}>{tier.cta}</div>
          <div style={{ display: 'flex', height: p(22), alignItems: 'center' }}>{tier.perUnit ? <span style={{ fontFamily: t.fonts.body, fontSize: p(17), color: t.textMuted }}>{tier.perUnit}</span> : null}</div>
        </div>
      </div>
    </GlassSurface>
  )
}

// Banner superior grande: placa dorada + sello circular EN EL COLOR DEL NICHO (variación de esquema).
function TopBanner({ text, t }: { text: string; t: ThemeTokens }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 42px 10px 10px', borderRadius: 22, backgroundImage: goldGradient(t.gold, t.goldDark), border: '2px solid #fff3c4', boxShadow: '0 12px 30px rgba(0,0,0,0.34)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 76, height: 76, borderRadius: 999, marginRight: 20, background: t.accent, border: '3px solid #fffbe6', boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.4)' }}>
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

  const K = 1.4                     // factor único: la card central es la base × K
  const sideW = 300, sideY = 548
  const cW = 300 * K, cX = Math.round((W - cW) / 2), cY = 1132
  const logos: ReactNode[] = [<YapeLogo key="y" />, <MercadoPagoLogo key="m" />, <VisaLogo key="v" />, <MastercardLogo key="c" />, <FlagPE key="pe" />, <FlagUS key="us" />]

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: H }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: W, height: 470, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1060, width: W, height: 860, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.22) 55%, rgba(10,14,24,0.36) 100%)' }} />

      {/* Header: banner + título + eyebrow dorado */}
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

      {/* Badge dorado sobre el producto (mayor ahorro) */}
      {maxSave > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', position: 'absolute', left: 0, top: 392, width: W }}>
          <Ribbon label={`Hasta ${maxSave}% OFF`} t={t} fs={30} />
        </div>
      ) : null}

      {/* Dos cards base (k=1) a los lados del producto */}
      {sides[0] ? <Card tier={sides[0]} x={MX} y={sideY} k={1} blurBg={blurBg} t={t} /> : null}
      {sides[1] ? <Card tier={sides[1]} x={W - MX - sideW} y={sideY} k={1} blurBg={blurBg} t={t} /> : null}

      {/* Card central = base × K, angosta y centrada (no pisa al modelo) */}
      <Card tier={featured} x={cX} y={cY} k={K} blurBg={blurBg} t={t} />

      {/* Fila de pagos SIN glass — logos directos sobre la escena */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 0, top: 1712, width: W, gap: 16 }}>
        {logos}
        <div style={{ display: 'flex', marginLeft: 8 }}><GoldSeal label="Garantía" gold={t.gold} goldDark={t.goldDark} size={78} /></div>
      </div>
    </div>
  )
}
