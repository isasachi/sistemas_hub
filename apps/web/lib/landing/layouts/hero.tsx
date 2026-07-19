import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import type { Offer, SectionCopy, TrustBlock } from '../types'
import { GoldSeal } from '../devices'
import { CW } from './glass'
import { SectionHeader, PricePlaque, TrustStrip } from './parts'

// Layout HERO (híbrido). ADN CLEARSTEM ref #1: headline (con palabra-acento) + subhead arriba a la
// izquierda; sello dorado "Mejor valor" junto al producto; placa de precio navy y strip de confianza
// abajo. La escena (Gemini) trae al beneficiario (derecha), el producto (centro-bajo) y el inset
// "ANTES" (izquierda). offer → placa + sello; TrustBlock → strip; copy → headline/subhead.

export function HeroLayout(
  { offer, trust, copy, theme: t }: { offer: Offer | null; trust: TrustBlock | null; copy: SectionCopy | null; theme: ThemeTokens },
): ReactElement {
  const headline = copy?.headline ?? 'Acabá con el acné hormonal que siempre vuelve'
  const subheadline = copy?.subheadline ?? 'Combate el origen del problema desde adentro y recupera una piel más limpia.'
  const featured = offer?.tiers.find((tt) => tt.featured)

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 560, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1300, width: CW, height: 620, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.24) 60%, rgba(10,14,24,0.38) 100%)' }} />

      {/* Header arriba-izquierda (la derecha la ocupa el beneficiario de la escena) */}
      <div style={{ display: 'flex', position: 'absolute', left: 60, top: 60, width: 560 }}>
        <SectionHeader headline={headline} subheadline={subheadline} accent={copy?.accentWord} t={t} width={560} size={62} />
      </div>

      {/* Etiqueta ANTES sobre el inset del problema (escena, izquierda-media) */}
      <div style={{ display: 'flex', position: 'absolute', left: 96, top: 726, alignItems: 'center', justifyContent: 'center', padding: '6px 22px', borderRadius: 999, background: t.textPrimary, boxShadow: '0 6px 14px rgba(0,0,0,0.3)' }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 24, color: '#fff', letterSpacing: 1 }}>ANTES</span>
      </div>

      {/* Sello dorado junto al producto (derecha-media) */}
      <div style={{ display: 'flex', position: 'absolute', left: 812, top: 828 }}>
        <GoldSeal label={featured?.badge ?? 'Mejor valor'} gold={t.gold} goldDark={t.goldDark} size={168} />
      </div>

      {/* Placa de precio navy (abajo-izquierda) */}
      {offer ? (
        <div style={{ display: 'flex', position: 'absolute', left: 60, top: 1160 }}>
          <PricePlaque offer={offer} t={t} />
        </div>
      ) : null}

      {/* Strip de confianza (pie) */}
      {trust ? (
        <div style={{ display: 'flex', justifyContent: 'center', position: 'absolute', left: 60, top: 1740, width: 960 }}>
          <TrustStrip trust={trust} t={t} width={960} />
        </div>
      ) : null}
    </div>
  )
}
