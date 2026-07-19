import type { ReactElement, ReactNode } from 'react'
import type { ThemeTokens } from '../theme'
import type { TrustBlock } from '../types'
import { PaymentLogo, FlagPE, FlagUS, GoldSeal } from '../devices'
import { CW } from './glass'

// Overlay del motor de DIFUSIÓN (goal 2026-07-18): lo ÚNICO que se composita sobre la imagen
// generada son los logos de marca REALES (medios de pago + banderas + sello), en la banda inferior
// que la difusión dejó limpia (ver PAYMENT_BAND en instructions.ts). Todo lo demás (texto, precios,
// filas de confianza) lo dibuja la difusión. renderComposite(imagenDifusión, PaymentBar, fonts).

export function PaymentBar(
  { trust, theme: t }: { trust: TrustBlock | null; theme: ThemeTokens },
): ReactElement {
  const methods = (trust?.paymentMethods ?? []).slice(0, 5)
  const cov = trust?.coverage ?? []
  const flags: ReactNode[] = []
  if (cov.some((c) => /per[uú]/i.test(c))) flags.push(<FlagPE key="pe" h={40} />)
  if (cov.some((c) => /ee\.?uu|usa|estados/i.test(c))) flags.push(<FlagUS key="us" h={40} />)

  const BAND_Y = 1706, BAND_H = 214

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 16,
        position: 'absolute', left: 0, top: BAND_Y, width: CW, height: BAND_H, padding: '0 40px',
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.80) 24%, rgba(255,255,255,0.92) 100%)',
      }}>
        {methods.map((m, i) => <PaymentLogo key={i} method={m} h={62} />)}
        {flags.length ? <div style={{ display: 'flex', gap: 8, marginLeft: 4 }}>{flags}</div> : null}
        {trust?.guaranteeDays ? <div style={{ display: 'flex', marginLeft: 6 }}><GoldSeal label="100%" gold={t.gold} goldDark={t.goldDark} size={82} /></div> : null}
      </div>
    </div>
  )
}
