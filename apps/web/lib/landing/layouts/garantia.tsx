import type { ReactElement, ReactNode } from 'react'
import type { ThemeTokens } from '../theme'
import type { SectionCopy, TrustBlock } from '../types'
import { TruckIcon, ClockIcon, ShieldIcon, CheckDisc, GoldSeal, PaymentLogo, FlagPE, FlagUS } from '../devices'
import { GlassSurface, CW } from './glass'

// Layout de composición de la sección GARANTÍA / CONFIANZA (motor híbrido, Fase 5 C5.5). Formato
// ADN CLEARSTEM (ref "Envío rápido y pago seguro"): una columna de pills frosted con icono glossy
// + título + línea, y una fila de pagos con LOGOS REALES + sello dorado. TODO sale del TrustBlock
// que cargó el usuario — nada lo inventa el LLM. La escena (Gemini) trae el producto abajo-derecha
// y (opcional) el beneficiario; la composición ocupa la columna izquierda y el pie.

const SHADOW = '0 18px 40px rgba(14,40,88,0.20)'

// "24/48 horas" → "48h" para el sello (el mayor número + h). null si no hay número.
function sealHours(deliveryTime?: string): string | null {
  const nums = (deliveryTime?.match(/\d+/g) ?? []).map(Number)
  return nums.length ? `${Math.max(...nums)}h` : null
}

function IconBadge({ accent, children }: { accent: string; children: ReactNode }): ReactElement {
  return (
    <div style={{
      display: 'flex', width: 82, height: 82, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
      backgroundImage: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.6), ${accent} 72%)`, boxShadow: `0 6px 14px ${accent}55`,
    }}>{children}</div>
  )
}

function TrustPill(
  { y, icon, title, line, seal, t, blurBg }:
  { y: number; icon: ReactNode; title: string; line?: string; seal?: ReactNode; t: ThemeTokens; blurBg: string },
): ReactElement {
  const x = 56, w = 720, h = 148
  return (
    <GlassSurface x={x} y={y} w={w} h={h} blurBg={blurBg} radius={26} bw={1.5} borderColor="rgba(255,255,255,0.55)" shadow={SHADOW}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: w, height: h, padding: '0 26px' }}>
        <div style={{ display: 'flex', marginRight: 22 }}>{icon}</div>
        <div style={{ display: 'flex', flexDirection: 'column', width: seal ? 400 : 500 }}>
          <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 34, color: t.textPrimary, lineHeight: 1.1 }}>{title}</span>
          {line ? <span style={{ fontFamily: t.fonts.body, fontSize: 23, color: t.textMuted, marginTop: 4 }}>{line}</span> : null}
        </div>
        {seal ? <div style={{ display: 'flex', marginLeft: 'auto' }}>{seal}</div> : null}
      </div>
    </GlassSurface>
  )
}

export function GarantiaLayout(
  { trust, copy, theme: t, blurBg }: { trust: TrustBlock | null; copy: SectionCopy | null; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const headline = copy?.headline ?? 'Envío rápido y pago seguro'
  const subheadline = copy?.subheadline ?? 'Tu tranquilidad, nuestra prioridad'
  const tagline = copy?.cta ?? '¡Confiable, fácil y rápido!'

  // Filas de confianza, en orden, solo las que el TrustBlock habilita. Máx 4 pills (caben en el
  // stack izquierdo sin pisar el producto de la escena).
  const rows: { icon: ReactNode; title: string; line?: string; seal?: ReactNode }[] = []
  if (trust?.coverage?.length) {
    rows.push({
      icon: <IconBadge accent={t.accent}><TruckIcon color="#fff" size={44} /></IconBadge>,
      title: `Domicilio en ${trust.coverage.join(' y ')}`,
      line: trust.freeShipping ? 'Envío gratis a todo el país' : 'Recíbelo en casa, cómodo y seguro',
      seal: (trust.coverage.some((c) => /per[uú]/i.test(c)) || trust.coverage.some((c) => /ee\.?uu|usa|estados/i.test(c)))
        ? <div style={{ display: 'flex', gap: 6 }}>{trust.coverage.some((c) => /per[uú]/i.test(c)) ? <FlagPE h={34} /> : null}{trust.coverage.some((c) => /ee\.?uu|usa|estados/i.test(c)) ? <FlagUS h={34} /> : null}</div>
        : undefined,
    })
  }
  if (trust?.deliveryTime) {
    const s = sealHours(trust.deliveryTime)
    rows.push({
      icon: <IconBadge accent={t.accent}><ClockIcon color="#fff" size={44} /></IconBadge>,
      title: `Entrega en ${trust.deliveryTime}`,
      line: 'Dictas tu dirección, ¡y listo!',
      seal: s ? <GoldSeal label={s} gold={t.gold} goldDark={t.goldDark} size={84} /> : undefined,
    })
  }
  if (trust?.codDelivery) {
    rows.push({
      icon: <CheckDisc symbol="$" accent="#16a34a" size={82} />,
      title: 'Pago Contraentrega',
      line: 'Pagas en efectivo cuando llega',
    })
  }
  if (trust?.guaranteeDays) {
    rows.push({
      icon: <IconBadge accent={t.accent}><ShieldIcon color="#fff" size={44} /></IconBadge>,
      title: 'Compra 100% Segura',
      line: trust.guaranteeText ?? `Garantía de ${trust.guaranteeDays} días y pago cifrado`,
      seal: <GoldSeal label="100%" gold={t.gold} goldDark={t.goldDark} size={84} />,
    })
  }
  const pills = rows.slice(0, 4)
  const startY = 372
  const gap = 168

  const methods = trust?.paymentMethods ?? []

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      {/* scrims: claro arriba (header oscuro legible), oscuro abajo (integra el pie) */}
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 430, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1400, width: CW, height: 520, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.30) 60%, rgba(10,14,24,0.44) 100%)' }} />

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 60, top: 56, width: 900 }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 68, color: t.textPrimary, lineHeight: 1.04, letterSpacing: -1 }}>{headline}</span>
        <span style={{ fontFamily: t.fonts.body, fontSize: 30, color: t.textMuted, marginTop: 10 }}>{subheadline}</span>
      </div>

      {/* Pills de confianza */}
      {pills.map((r, i) => (
        <TrustPill key={i} y={startY + i * gap} icon={r.icon} title={r.title} line={r.line} seal={r.seal} t={t} blurBg={blurBg} />
      ))}

      {/* Fila de pagos + sello */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', left: 0, top: 1600, width: CW }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 40, color: t.textPrimary, marginBottom: 20 }}>Paga como prefieras</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 16, maxWidth: 960 }}>
          {methods.map((m, i) => <PaymentLogo key={i} method={m} h={58} />)}
          <div style={{ display: 'flex', marginLeft: 8 }}><GoldSeal label="100%" gold={t.gold} goldDark={t.goldDark} size={78} /></div>
        </div>
      </div>

      {/* Tagline de cierre */}
      <div style={{ display: 'flex', justifyContent: 'center', position: 'absolute', left: 0, top: 1836, width: CW }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 42, color: t.textPrimary }}>{tagline}</span>
      </div>
    </div>
  )
}
