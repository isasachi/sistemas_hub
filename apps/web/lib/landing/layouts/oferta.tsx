import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import type { OfferCopy, OfferTier } from '../types'
import {
  GoldRibbon, SavingsRibbon,
  YapeLogo, MercadoPagoLogo, VisaLogo, MastercardLogo, FlagPE, FlagUS,
} from '../devices'

// Layout de composición de la sección OFERTA (motor híbrido, Fase 1). Traducción directa de
// SECTION_SPECS.oferta a JSX real sobre la escena de Gemini. La escena pone el producto en el
// CENTRO, así que el texto se ancla ARRIBA (headline) y ABAJO (tiers+pagos), dejando respirar
// al producto en el medio. Cards de glass simulado (Camino A) opacas lo suficiente para leerse
// sobre una escena con producto. Todo el texto sale de acá, nunca de la IA.

// Luminancia relativa aproximada → decide texto blanco/oscuro sobre un fill de color de marca
// (un accent claro con texto blanco = CTA invisible; el bug que esto evita).
function isLight(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62
}

// Glass simulado (Camino A) legible: gradiente blanco casi-opaco + borde superior claro +
// sombra. Sobre una escena con producto el 0.14 original era ilegible; esto se lee como frosted.
const glass = (t: ThemeTokens, featured: boolean) => ({
  backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.90), rgba(255,255,255,0.74))',
  borderTop: `1px solid ${t.surfaceBorder}`,
  border: featured ? `2px solid ${t.gold}` : '1px solid rgba(255,255,255,0.7)',
  boxShadow: featured ? '0 18px 44px rgba(0,0,0,0.34)' : '0 12px 30px rgba(0,0,0,0.26)',
})

function Headline({ text, t }: { text: string; t: ThemeTokens }): ReactElement {
  // Una sola pieza de texto (envuelve de forma fiable en Satori); sin split por palabra para
  // no cortar headlines largos. El accent vive en urgency/featured/CTAs.
  return (
    <div style={{ display: 'flex', width: '100%', justifyContent: 'center' }}>
      <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 58, color: t.textPrimary, textAlign: 'center', lineHeight: 1.06 }}>{text}</span>
    </div>
  )
}

function Cta({ label, featured, t }: { label: string; featured: boolean; t: ThemeTokens }): ReactElement {
  const base = {
    display: 'flex' as const, alignItems: 'center', justifyContent: 'center', marginTop: 8,
    padding: '13px 24px', borderRadius: 999, fontFamily: t.fonts.body, fontWeight: 700, fontSize: 26,
    boxShadow: '0 8px 18px rgba(0,0,0,0.28)',
  }
  // Sin valores undefined en el style (rompen Satori). Featured = gradiente dorado; el resto,
  // fill accent con texto de contraste (blanco si el accent es oscuro, textPrimary si es claro).
  const style = featured
    ? { ...base, backgroundImage: `linear-gradient(145deg, ${t.gold}, ${t.goldDark})`, color: '#3a2a05' }
    : { ...base, background: t.accent, color: isLight(t.accent) ? t.textPrimary : '#fff' }
  return <div style={style}>{label}</div>
}

function TierCard({ tier, t }: { tier: OfferTier; t: ThemeTokens }): ReactElement {
  const rec = tier.featured
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
      marginTop: rec ? 0 : 30, padding: '24px 14px 20px', gap: 9, borderRadius: 24,
      position: 'relative', ...glass(t, rec),
    }}>
      {rec && (
        <div style={{ display: 'flex', position: 'absolute', top: -20 }}>
          <GoldRibbon label={tier.badge ?? 'Recomendado'} gold={t.gold} goldDark={t.goldDark} />
        </div>
      )}
      <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 30, color: t.textPrimary, textAlign: 'center', marginTop: rec ? 16 : 0 }}>{tier.label}</span>
      {tier.priceBefore && (
        <span style={{ fontFamily: t.fonts.body, fontSize: 23, color: t.textMuted, textDecoration: 'line-through' }}>Antes: {tier.priceBefore}</span>
      )}
      <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 62, color: t.textPrimary, lineHeight: 1 }}>{tier.price}</span>
      {typeof tier.savingsPct === 'number' && (
        <div style={{ display: 'flex' }}><SavingsRibbon label={`Ahorra ${tier.savingsPct}%`} gold={t.gold} goldDark={t.goldDark} /></div>
      )}
      {tier.perUnit && <span style={{ fontFamily: t.fonts.body, fontSize: 22, color: t.textMuted }}>{tier.perUnit}</span>}
      <Cta label={tier.cta} featured={rec} t={t} />
    </div>
  )
}

export function OfertaLayout({ copy, theme: t }: { copy: OfferCopy; theme: ThemeTokens }): ReactElement {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'absolute', top: 0, left: 0, width: 1080, height: 1920,
      padding: '80px 46px 72px',
    }}>
      {/* Banner de urgencia dorado — solo si el copy lo trae */}
      {copy.urgency && <GoldRibbon label={copy.urgency} gold={t.gold} goldDark={t.goldDark} />}

      {/* Headline + subheadline, anclados ARRIBA */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: copy.urgency ? 22 : 0 }}>
        <Headline text={copy.headline} t={t} />
        {copy.subheadline && (
          <div style={{ display: 'flex', width: '100%', justifyContent: 'center' }}>
            <span style={{ fontFamily: t.fonts.body, fontSize: 29, color: t.textPrimary, textAlign: 'center', maxWidth: 860 }}>{copy.subheadline}</span>
          </div>
        )}
      </div>

      {/* El producto de la escena respira en el medio */}
      <div style={{ display: 'flex', flex: 1 }} />

      {/* Fila de tiers en glass, anclada ABAJO */}
      <div style={{ display: 'flex', width: '100%', gap: 14, alignItems: 'flex-start' }}>
        {copy.tiers.map((tier, i) => <TierCard key={i} tier={tier} t={t} />)}
      </div>

      {/* Strip de pagos (hardcodeado en F1; Fase 5 lo vuelve condicional) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 22,
        padding: '18px 28px', borderRadius: 20,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.5))',
        borderTop: `1px solid ${t.surfaceBorder}`,
      }}>
        <YapeLogo /><MercadoPagoLogo /><VisaLogo /><MastercardLogo />
        <div style={{ display: 'flex', gap: 8, marginLeft: 6 }}><FlagPE /><FlagUS /></div>
      </div>
    </div>
  )
}
