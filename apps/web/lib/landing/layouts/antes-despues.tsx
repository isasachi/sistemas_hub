import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import type { SectionCopy } from '../types'
import { XMark, CheckMark } from '../devices'
import { GlassSurface, CW } from './glass'
import { SectionHeader } from './parts'

// Layout ANTES/DESPUÉS (híbrido). ADN CLEARSTEM ref #3: header + dos fotos (escena, con labels
// ANTES/DESPUÉS + flecha compuestos) + dos columnas de checks (rojo X = problemas / verde ✓ =
// resultados) + tagline. Los problemas salen de copy.bullets; los resultados de copy.bulletsAfter.

const SHADOW = '0 16px 36px rgba(14,40,88,0.18)'

function Label({ text, x, t }: { text: string; x: number; t: ThemeTokens }): ReactElement {
  return (
    <div style={{ display: 'flex', position: 'absolute', left: x, top: 384, alignItems: 'center', justifyContent: 'center', padding: '8px 26px', borderRadius: 999, background: t.textPrimary, boxShadow: '0 6px 14px rgba(0,0,0,0.3)' }}>
      <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 26, color: '#fff', letterSpacing: 1 }}>{text}</span>
    </div>
  )
}

function Column(
  { x, items, positive, t, blurBg }: { x: number; items: string[]; positive: boolean; t: ThemeTokens; blurBg: string },
): ReactElement {
  const w = 468, h = 452, rowH = h / Math.max(items.length, 1)
  return (
    <GlassSurface x={x} y={772} w={w} h={h} blurBg={blurBg} radius={26} bw={1.5} borderColor="rgba(255,255,255,0.5)" shadow={SHADOW}>
      <div style={{ display: 'flex', flexDirection: 'column', width: w, height: h, padding: '10px 28px', justifyContent: 'center' }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', height: rowH }}>
            <div style={{ display: 'flex', marginRight: 16 }}>{positive ? <CheckMark size={34} /> : <XMark size={34} />}</div>
            <span style={{ display: 'flex', flex: 1, fontFamily: t.fonts.body, fontWeight: 600, fontSize: 27, color: t.textPrimary, lineHeight: 1.15 }}>{it}</span>
          </div>
        ))}
      </div>
    </GlassSurface>
  )
}

export function AntesDespuesLayout(
  { copy, theme: t, blurBg }: { copy: SectionCopy | null; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const headline = copy?.headline ?? 'Miles de personas recuperaron su confianza'
  const subheadline = copy?.subheadline ?? 'Resultados reales, desde el interior hacia afuera.'
  const problems = (copy?.bullets ?? []).slice(0, 4)
  const results = (copy?.bulletsAfter ?? []).slice(0, 4)
  const tagline = copy?.cta ?? 'El cambio comienza desde adentro'

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 320, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1340, width: CW, height: 580, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.26) 70%, rgba(10,14,24,0.4) 100%)' }} />

      <div style={{ display: 'flex', position: 'absolute', left: 60, top: 66, width: 940 }}>
        <SectionHeader headline={headline} subheadline={subheadline} accent={copy?.accentWord} t={t} width={940} size={58} />
      </div>

      {/* Labels + flecha sobre la banda de fotos (escena: dos caras antes/después ~y 360-720). */}
      <Label text="ANTES" x={150} t={t} />
      <Label text="DESPUÉS" x={640} t={t} />
      <div style={{ display: 'flex', position: 'absolute', left: 496, top: 512, width: 88, height: 88, borderRadius: 999, background: t.accent, alignItems: 'center', justifyContent: 'center', border: '4px solid #fff', boxShadow: '0 8px 18px rgba(14,40,88,0.35)' }}>
        <svg width={40} height={40} viewBox="0 0 24 24"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>

      {problems.length ? <Column x={56} items={problems} positive={false} t={t} blurBg={blurBg} /> : null}
      {results.length ? <Column x={556} items={results} positive t={t} blurBg={blurBg} /> : null}

      <div style={{ display: 'flex', justifyContent: 'center', position: 'absolute', left: 0, top: 1300, width: CW }}>
        <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 42, color: t.textPrimary, textAlign: 'center' }}>{tagline}</span>
      </div>
    </div>
  )
}
