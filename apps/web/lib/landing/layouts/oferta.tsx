import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import type { OfferCopy, OfferTier } from '../types'
import {
  GoldRibbon, SavingsRibbon,
  YapeLogo, MercadoPagoLogo, VisaLogo, MastercardLogo, FlagPE, FlagUS,
} from '../devices'

// Layout de composición de la sección OFERTA (motor híbrido, Fase 1). Traducción directa de
// SECTION_SPECS.oferta a JSX real sobre la escena de Gemini: banner de urgencia condicional,
// headline+sub, fila de cards glass (una por tier, decoy elevado y coronado en oro), strip de
// pagos hardcodeado (Fase 5 lo vuelve condicional). Todo el texto sale de acá, nunca de la IA.

// Headline con la ÚLTIMA palabra en accent (heurística DR: el payoff suele cerrar la frase).
// nbsp antes de la palabra para que Satori no recorte el espacio (gotcha de Fase 0).
function Headline({ text, t }: { text: string; t: ThemeTokens }): ReactElement {
  const words = text.trim().split(/\s+/)
  const base = { fontFamily: t.fonts.display, fontWeight: 700, fontSize: 64, color: t.textPrimary, textAlign: 'center' as const, lineHeight: 1.05 }
  if (words.length < 2) return <span style={base}>{text}</span>
  const last = words.pop()!
  return <span style={base}>{words.join(' ')}<span style={{ color: t.accent }}>{` ${last}`}</span></span>
}

function TierCard({ tier, t }: { tier: OfferTier; t: ThemeTokens }): ReactElement {
  const rec = tier.featured
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
      marginTop: rec ? 0 : 34, padding: '26px 16px 22px', gap: 10, borderRadius: 26,
      background: t.surface, borderTop: `1px solid ${t.surfaceBorder}`,
      border: rec ? `2px solid ${t.gold}` : `1px solid ${t.surfaceBorder}`,
      boxShadow: rec ? '0 18px 44px rgba(0,0,0,0.34)' : '0 10px 28px rgba(0,0,0,0.22)',
      position: 'relative',
    }}>
      {rec && (
        <div style={{ display: 'flex', position: 'absolute', top: -22 }}>
          <GoldRibbon label={tier.badge ?? 'Recomendado'} gold={t.gold} goldDark={t.goldDark} />
        </div>
      )}
      <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 32, color: t.textPrimary, marginTop: rec ? 16 : 0 }}>{tier.label}</span>
      {tier.priceBefore && (
        <span style={{ fontFamily: t.fonts.body, fontSize: 24, color: t.textMuted, textDecoration: 'line-through' }}>Antes: {tier.priceBefore}</span>
      )}
      <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 68, color: t.textPrimary, lineHeight: 1 }}>{tier.price}</span>
      {typeof tier.savingsPct === 'number' && (
        <div style={{ display: 'flex' }}><SavingsRibbon label={`Ahorra ${tier.savingsPct}%`} gold={t.gold} goldDark={t.goldDark} /></div>
      )}
      {tier.perUnit && <span style={{ fontFamily: t.fonts.body, fontSize: 23, color: t.textMuted }}>{tier.perUnit}</span>}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8,
        padding: '14px 26px', borderRadius: 999,
        background: rec ? `linear-gradient(145deg, ${t.gold}, ${t.goldDark})` : t.accent,
        color: rec ? '#3a2a05' : '#fff', fontFamily: t.fonts.body, fontWeight: 700, fontSize: 27,
        boxShadow: '0 8px 18px rgba(0,0,0,0.28)',
      }}>{tier.cta}</div>
    </div>
  )
}

export function OfertaLayout({ copy, theme: t }: { copy: OfferCopy; theme: ThemeTokens }): ReactElement {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'absolute', top: 0, left: 0, width: 1080, height: 1920,
      padding: '96px 52px 88px', justifyContent: 'space-between',
    }}>
      {/* Banner de urgencia dorado — solo si el copy lo trae */}
      {copy.urgency
        ? <GoldRibbon label={copy.urgency} gold={t.gold} goldDark={t.goldDark} />
        : <div style={{ display: 'flex' }} />}

      {/* Headline + subheadline */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <Headline text={copy.headline} t={t} />
        {copy.subheadline && (
          <span style={{ fontFamily: t.fonts.body, fontSize: 30, color: t.textMuted, textAlign: 'center' }}>{copy.subheadline}</span>
        )}
      </div>

      {/* Fila de tiers en glass */}
      <div style={{ display: 'flex', width: '100%', gap: 16, alignItems: 'flex-start' }}>
        {copy.tiers.map((tier, i) => <TierCard key={i} tier={tier} t={t} />)}
      </div>

      {/* Strip de pagos (hardcodeado en F1; Fase 5 lo vuelve condicional) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        padding: '20px 30px', borderRadius: 22, background: t.surface, borderTop: `1px solid ${t.surfaceBorder}`,
      }}>
        <YapeLogo /><MercadoPagoLogo /><VisaLogo /><MastercardLogo />
        <div style={{ display: 'flex', gap: 8, marginLeft: 6 }}><FlagPE /><FlagUS /></div>
      </div>
    </div>
  )
}
