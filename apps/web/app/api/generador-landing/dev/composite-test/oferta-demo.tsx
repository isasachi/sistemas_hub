import type { ReactElement } from 'react'
import type { ThemeTokens } from '@/lib/landing/theme'
import {
  GoldRibbon, SavingsRibbon, GoldSeal,
  YapeLogo, MercadoPagoLogo, VisaLogo, MastercardLogo, FlagPE, FlagUS,
  TruckIcon, ShieldIcon,
} from '@/lib/landing/devices'

// Layout de Oferta HARDCODEADO para la ruta de prueba de la Fase 0. Ejercita todo lo que el
// criterio de aceptación mira: texto legible con fuente del catálogo, 3 tiers en glass, ribbon
// dorado sobre el tier recomendado, cinta "Ahorra %", y strip de pagos (Yape/MP/Visa/MC).
// No es la Oferta real (eso es la Fase 1) — es un banco de pruebas de la infra de composición.

type Tier = { qty: string; before: string; price: string; unit: string; save?: string; recommended?: boolean }
const TIERS: Tier[] = [
  { qty: '1 unidad',  before: 'S/ 129', price: 'S/ 99',  unit: 'S/ 99 c/u' },
  { qty: '2 unidades', before: 'S/ 258', price: 'S/ 169', unit: 'S/ 84 c/u', save: 'Ahorra 35%', recommended: true },
  { qty: '3 unidades', before: 'S/ 387', price: 'S/ 229', unit: 'S/ 76 c/u', save: 'Ahorra 41%' },
]

function TierCard({ tier, t }: { tier: Tier; t: ThemeTokens }) {
  const rec = tier.recommended
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
      marginTop: rec ? 0 : 34, padding: '26px 18px 22px', gap: 10, borderRadius: 26,
      background: t.surface,
      borderTop: `1px solid ${t.surfaceBorder}`,
      border: rec ? `2px solid ${t.gold}` : `1px solid ${t.surfaceBorder}`,
      boxShadow: rec ? '0 18px 44px rgba(0,0,0,0.34)' : '0 10px 28px rgba(0,0,0,0.22)',
      position: 'relative',
    }}>
      {rec && (
        <div style={{ display: 'flex', position: 'absolute', top: -22 }}>
          <GoldRibbon label="Recomendado" gold={t.gold} goldDark={t.goldDark} />
        </div>
      )}
      <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 34, color: t.textPrimary, marginTop: rec ? 16 : 0 }}>{tier.qty}</span>
      <span style={{ fontFamily: t.fonts.body, fontSize: 24, color: t.textMuted, textDecoration: 'line-through' }}>Antes: {tier.before}</span>
      <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 72, color: t.textPrimary, lineHeight: 1 }}>{tier.price}</span>
      <span style={{ fontFamily: t.fonts.body, fontSize: 24, color: t.textMuted }}>{tier.unit}</span>
      {tier.save && <div style={{ display: 'flex', marginTop: 2 }}><SavingsRibbon label={tier.save} gold={t.gold} goldDark={t.goldDark} /></div>}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8,
        padding: '14px 28px', borderRadius: 999,
        background: rec ? `linear-gradient(145deg, ${t.gold}, ${t.goldDark})` : t.accent,
        color: rec ? '#3a2a05' : '#fff', fontFamily: t.fonts.body, fontWeight: 700, fontSize: 28,
        boxShadow: '0 8px 18px rgba(0,0,0,0.28)',
      }}>Lo quiero</div>
    </div>
  )
}

export function OfertaDemo(t: ThemeTokens): ReactElement {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'absolute', top: 0, left: 0, width: 1080, height: 1920,
      padding: '110px 56px 90px', justifyContent: 'space-between',
    }}>
      {/* Headline con UNA palabra en accent */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {/* Satori recorta el whitespace alrededor de un <span> inline → usar   dentro
            del span para conservar los espacios (patrón para la palabra-accent del headline). */}
        <span style={{ fontFamily: t.fonts.display, fontWeight: 700, fontSize: 66, color: t.textPrimary, textAlign: 'center', lineHeight: 1.05 }}>
          Aprovecha la<span style={{ color: t.accent }}>{' oferta '}</span>de hoy
        </span>
        <span style={{ fontFamily: t.fonts.body, fontSize: 30, color: t.textMuted, textAlign: 'center' }}>
          Mientras dure el stock. Pago contra entrega en todo el Perú.
        </span>
      </div>

      {/* 3 tiers en glass */}
      <div style={{ display: 'flex', width: '100%', gap: 18, alignItems: 'flex-start' }}>
        {TIERS.map((tier) => <TierCard key={tier.qty} tier={tier} t={t} />)}
      </div>

      {/* Confianza: sello + fila de confianza */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <GoldSeal label="Garantía 100%" gold={t.gold} goldDark={t.goldDark} size={150} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TruckIcon color={t.textPrimary} size={38} />
            <span style={{ fontFamily: t.fonts.body, fontSize: 30, color: t.textPrimary, fontWeight: 700 }}>Envío gratis 24-48h</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShieldIcon color={t.textPrimary} size={38} />
            <span style={{ fontFamily: t.fonts.body, fontSize: 30, color: t.textPrimary, fontWeight: 700 }}>Compra 100% segura</span>
          </div>
        </div>
      </div>

      {/* Strip de pagos */}
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
