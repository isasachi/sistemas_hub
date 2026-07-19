import type { ReactElement, ReactNode } from 'react'
import type { ThemeTokens } from '../theme'
import type { SectionCopy } from '../types'
import { IconDisc, CheckMark, BalanceIcon, DropIcon, SparkleIcon, HeartIcon } from '../devices'
import { GlassSurface, CW } from './glass'
import { SectionHeader } from './parts'

// Layout BENEFICIOS (híbrido). ADN CLEARSTEM ref #4: header + una columna de filas frosted, cada
// una con un disco glossy de icono (badge verde) + título bold + línea, y un check verde a la
// derecha. El producto va abajo (escena). Los beneficios salen de copy.cards {title, body}.

const SHADOW = '0 16px 38px rgba(14,40,88,0.18)'
const ICONS: ReactNode[] = [
  <BalanceIcon key="b" color="#fff" size={44} />,
  <DropIcon key="d" color="#fff" size={44} />,
  <SparkleIcon key="s" color="#fff" size={44} />,
  <HeartIcon key="h" color="#fff" size={44} />,
]
const TINTS = ['#E48FB8', '#E4B24A', '#5B93D6', '#E07C9E']

export function BeneficiosLayout(
  { copy, theme: t, blurBg }: { copy: SectionCopy | null; theme: ThemeTokens; blurBg: string },
): ReactElement {
  const headline = copy?.headline ?? 'Apoya el equilibrio que tu piel necesita'
  const subheadline = copy?.subheadline ?? 'Una fórmula diseñada para trabajar desde el origen del problema.'
  const rows = (copy?.cards ?? []).slice(0, 4)
  const startY = 400, gap = 186, w = 968, x = 56, h = 152

  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 1920 }}>
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: CW, height: 380, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 1240, width: CW, height: 680, backgroundImage: 'linear-gradient(180deg, rgba(10,14,24,0) 0%, rgba(10,14,24,0.24) 70%, rgba(10,14,24,0.36) 100%)' }} />

      <div style={{ display: 'flex', position: 'absolute', left: 60, top: 64, width: 960 }}>
        <SectionHeader headline={headline} subheadline={subheadline} accent={copy?.accentWord} t={t} width={960} size={62} />
      </div>

      {rows.map((c, i) => (
        <GlassSurface key={i} x={x} y={startY + i * gap} w={w} h={h} blurBg={blurBg} radius={26} bw={1.5} borderColor="rgba(255,255,255,0.55)" shadow={SHADOW}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: w, height: h, padding: '0 30px' }}>
            <div style={{ display: 'flex', marginRight: 26 }}><IconDisc accent={TINTS[i % TINTS.length]} size={88}>{ICONS[i % ICONS.length]}</IconDisc></div>
            <div style={{ display: 'flex', flexDirection: 'column', width: 640 }}>
              <span style={{ fontFamily: t.fonts.display, fontWeight: 800, fontSize: 34, color: t.textPrimary, lineHeight: 1.12 }}>{c.title}</span>
              {c.body ? <span style={{ fontFamily: t.fonts.body, fontSize: 24, color: t.textMuted, marginTop: 3 }}>{c.body}</span> : null}
            </div>
            <div style={{ display: 'flex', marginLeft: 'auto' }}><CheckMark size={40} /></div>
          </div>
        </GlassSurface>
      ))}
    </div>
  )
}
