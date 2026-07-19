import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import type { Offer, SectionCopy, TrustBlock } from '../types'
import { GoldSeal, PaymentLogo, goldGradient } from '../devices'
import { GlassSurface, CW } from './glass'

// Layout de composición de la sección CTA FINAL (motor híbrido, Fase 5 C5.5). El cierre: headline
// + el precio del tier DESTACADO (referenciado de session.offer, no re-inventado — C5.1) + UNA
// pill de CTA + sello de garantía del TrustBlock. Decisivo y de alto contraste. La escena trae el
// producto como héroe arriba; la composición ocupa el tercio inferior.

const SHADOW = '0 22px 50px rgba(14,40,88,0.28)'

export function CtaFinalLayout(
  { offer, trust, copy, theme: t, blurBg }: { offer: Offer | null; trust: TrustBlock | null; copy: SectionCopy | null; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const featured = offer?.tiers.find((tt) => tt.featured) ?? offer?.tiers[offer.tiers.length - 1] ?? null
  const headline = copy?.headline ?? '¡Pídelo hoy mismo!'
  const subheadline = copy?.subheadline
  const ctaLabel = copy?.cta ?? featured?.cta ?? 'Comprar ahora'
  const [cur, ...rest] = (featured?.price ?? '').trim().split(/\s+/)
  const num = rest.join(' ') || cur
  const hasCur = rest.length > 0

  // Panel frosted en el tercio inferior: precio destacado + CTA. Ancho generoso, centrado.
  const px = 150, pw = CW - px * 2, py = 1120, ph = featured ? 620 : 420

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 440, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1040, width: CW, height: 880, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.30) 55%, rgba(10,14,24,0.42) 100%)' }} />

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 60, top: 72, width: CW - 120 }}>
        {offer?.urgency ? (
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 26px', borderRadius: 999, backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 800, fontSize: 26, textTransform: 'uppercase', letterSpacing: 1, border: '1px solid #fff3c4', boxShadow: '0 6px 16px rgba(0,0,0,0.28)', marginBottom: 18 }}>{offer.urgency}</div>
        ) : null}
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 78, color: t.textPrimary, textAlign: 'center', lineHeight: 1.03, letterSpacing: -1 }}>{headline}</span>
        {subheadline ? <span style={{ fontFamily: t.fonts.body, fontSize: 32, color: t.textMuted, textAlign: 'center', marginTop: 14, maxWidth: 820 }}>{subheadline}</span> : null}
      </div>

      {/* Panel de precio + CTA */}
      <GlassSurface x={px} y={py} w={pw} h={ph} blurBg={blurBg} radius={40} bw={2} borderColor={t.gold} shadow={SHADOW}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: pw, height: ph, padding: '40px' }}>
          {featured ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 44, color: t.textPrimary }}>{featured.label}</span>
              {featured.priceBefore ? <span style={{ fontFamily: t.fonts.body, fontSize: 30, color: t.textMuted, textDecoration: 'line-through', marginTop: 6 }}>Antes: {featured.priceBefore}</span> : null}
              <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 6 }}>
                {hasCur ? <span style={{ fontFamily: t.fonts.display, fontWeight: 900, fontSize: 64, color: t.goldDark, marginRight: 8, marginBottom: 18 }}>{cur}</span> : null}
                <span style={{ fontFamily: t.fonts.display, fontWeight: 900, fontSize: 150, color: t.goldDark, lineHeight: 1 }}>{num}</span>
              </div>
              {featured.perUnit ? <span style={{ fontFamily: t.fonts.body, fontSize: 26, color: t.textMuted, marginTop: 4 }}>{featured.perUnit}</span> : null}
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: featured ? 28 : 0, padding: '22px 64px', borderRadius: 999, backgroundImage: goldGradient(t.gold, t.goldDark), color: '#3a2a05', fontFamily: t.fonts.display, fontWeight: 900, fontSize: 44, letterSpacing: 0.5, border: '2px solid #fff3c4', boxShadow: '0 12px 26px rgba(0,0,0,0.34)' }}>{ctaLabel}</div>
        </div>
      </GlassSurface>

      {/* Sello de garantía + medios de pago (si el TrustBlock los trae) */}
      {trust?.guaranteeDays ? (
        <div style={{ display: 'flex', position: 'absolute', left: CW - 210, top: py - 60 }}>
          <GoldSeal label={trust.guaranteeText ? '100%' : `${trust.guaranteeDays}d`} gold={t.gold} goldDark={t.goldDark} size={150} />
        </div>
      ) : null}
      {trust?.paymentMethods?.length ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 14, position: 'absolute', left: 0, top: py + ph + 44, width: CW }}>
          {trust.paymentMethods.slice(0, 5).map((m, i) => <PaymentLogo key={i} method={m} h={52} />)}
        </div>
      ) : null}
    </div>
  )
}
