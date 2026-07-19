/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import type { SectionCopy } from '../types'
import { Stars } from '../devices'
import { GlassSurface, CW } from './glass'
import { SectionHeader } from './parts'

// Layout TESTIMONIOS (híbrido). ADN CLEARSTEM ref #5: header + 3 tarjetas frosted con avatar
// circular + 5 estrellas + reseña itálica + nombre/ciudad, y un cierre "+N mujeres confían".
// Los avatares son FOTOS: se componen como <img> (data-URI/URL), generados aparte — Satori no
// puede generar caras y una cara "detrás" del glass saldría borrosa. Placeholder si no hay avatar.
// copy.cards {title="Nombre, Ciudad", body=reseña}.

const SHADOW = '0 16px 38px rgba(14,40,88,0.18)'

function Avatar({ src, accent, size }: { src?: string; accent: string; size: number }): ReactElement {
  return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: 999, overflow: 'hidden', border: '3px solid #fff', boxShadow: '0 6px 16px rgba(14,40,88,0.28)', background: `radial-gradient(circle at 40% 30%, #fff, ${accent})` }}>
      {src ? <img src={src} width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} alt="" /> : null}
    </div>
  )
}

export function TestimoniosLayout(
  { copy, avatars = [], theme: t, blurBg }: { copy: SectionCopy | null; avatars?: string[]; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const headline = copy?.headline ?? 'Lo que dicen nuestras clientes'
  const rows = (copy?.cards ?? []).slice(0, 3)
  const footer = copy?.subheadline ?? '+10,000 mujeres ya confían en la marca'
  const x = 56, w = 968, startY = 372, h = 320, step = 348

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 340, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1470, width: CW, height: 450, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.28) 70%, rgba(10,14,24,0.4) 100%)' }} />

      <div style={{ display: 'flex', position: 'absolute', left: 60, top: 72, width: 960 }}>
        <SectionHeader headline={headline} accent={copy?.accentWord} t={t} width={960} size={60} />
      </div>

      {rows.map((c, i) => (
        <GlassSurface key={i} x={x} y={startY + i * step} w={w} h={h} blurBg={blurBg} radius={28} bw={1.5} borderColor="rgba(255,255,255,0.55)" shadow={SHADOW}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: w, height: h, padding: '0 40px' }}>
            <div style={{ display: 'flex', marginRight: 34 }}><Avatar src={avatars[i]} accent={t.accent} size={168} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', width: 640 }}>
              <Stars count={5} gold={t.gold} size={38} />
              <span style={{ fontFamily: t.fonts.body, fontStyle: 'italic', fontSize: 28, color: t.textPrimary, lineHeight: 1.32, marginTop: 14 }}>“{c.body}”</span>
              <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 26, color: t.accent, marginTop: 14 }}>{c.title}</span>
            </div>
          </div>
        </GlassSurface>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', position: 'absolute', left: 0, top: 1520, width: CW }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 42, color: t.textPrimary, textAlign: 'center' }}>{footer}</span>
      </div>
    </div>
  )
}
