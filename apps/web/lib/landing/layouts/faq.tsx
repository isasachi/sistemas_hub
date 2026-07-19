import type { ReactElement } from 'react'
import type { ThemeTokens } from '../theme'
import type { SectionCopy } from '../types'
import { PlusIcon } from '../devices'
import { GlassSurface, CW } from './glass'
import { SectionHeader } from './parts'

// Layout FAQ (híbrido). ADN CLEARSTEM ref #7: header + lista de tarjetas frosted pregunta/respuesta
// con un "+" a la derecha. Preguntas salen de copy.cards {title=pregunta, body=respuesta}. Hasta 5.

const SHADOW = '0 14px 32px rgba(14,40,88,0.16)'

export function FaqLayout(
  { copy, theme: t, blurBg }: { copy: SectionCopy | null; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const headline = copy?.headline ?? 'Preguntas frecuentes'
  const rows = (copy?.cards ?? []).slice(0, 5)
  const x = 56, w = 968, startY = 360
  // Alto por fila según cantidad (5 filas → más compactas para caber).
  const h = rows.length >= 5 ? 236 : 260
  const step = h + 24

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 340, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1560, width: CW, height: 360, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.24) 100%)' }} />

      <div style={{ display: 'flex', position: 'absolute', left: 60, top: 72, width: 960 }}>
        <SectionHeader headline={headline} accent={copy?.accentWord} t={t} width={960} size={62} />
      </div>

      {rows.map((c, i) => (
        <GlassSurface key={i} x={x} y={startY + i * step} w={w} h={h} blurBg={blurBg} radius={24} bw={1.5} borderColor="rgba(255,255,255,0.5)" shadow={SHADOW}>
          <div style={{ display: 'flex', flexDirection: 'column', width: w, height: h, padding: '26px 30px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: w - 60 }}>
              <span style={{ display: 'flex', flex: 1, fontFamily: t.fonts.display, fontWeight: 700, fontSize: 32, color: t.textPrimary, lineHeight: 1.15 }}>{c.title}</span>
              <div style={{ display: 'flex', marginLeft: 18 }}><PlusIcon color={t.accent} size={34} /></div>
            </div>
            {c.body ? <span style={{ fontFamily: t.fonts.body, fontSize: 24, color: t.textMuted, marginTop: 12, lineHeight: 1.3 }}>{c.body}</span> : null}
          </div>
        </GlassSurface>
      ))}
    </div>
  )
}
