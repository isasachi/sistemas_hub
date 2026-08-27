'use client'

import { useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { ChipGroup } from '@/components/tools/ui/ChipGroup'
import { SECTION_LABELS, SectionType, type SectionCopy } from '@/lib/landing/types'
import { validateSet } from '@/lib/landing/validate-set'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'
const btnGhost =
  'h-10 px-4 rounded-xl border border-white/[0.14] text-[#efe7e0] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent'

const TYPES = SectionType.options
const LABEL_TO_TYPE = Object.fromEntries(TYPES.map((t) => [SECTION_LABELS[t], t])) as Record<string, SectionType>
const OPTIONS = TYPES.map((t) => SECTION_LABELS[t])

function CopyCard({ c }: { c: SectionCopy }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#2a0f1a] px-4 py-3 flex flex-col gap-1">
      <p className="text-[11px] uppercase tracking-wide text-[#a98c88]">{SECTION_LABELS[c.kind]}</p>
      <p className="text-[14px] font-bold text-[#efe7e0]">{c.headline}</p>
      {c.subheadline && <p className="text-[12px] text-[#c9b4ae]">{c.subheadline}</p>}
      {c.bullets?.length ? (
        <ul className="text-[12px] text-[#c9b4ae] list-disc pl-4">{c.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
      ) : null}
      {c.cards?.length ? (
        <div className="flex flex-col gap-1 mt-1">{c.cards.map((card, i) => (
          <p key={i} className="text-[12px] text-[#c9b4ae]"><span className="font-semibold text-[#efe7e0]">{card.title}:</span> {card.body}</p>
        ))}</div>
      ) : null}
      {c.cta && <p className="text-[12px] text-[#e8467a] font-semibold mt-1">[ {c.cta} ]</p>}
    </div>
  )
}

export default function Section3Sections() {
  const { sessionId, selectedSections, copy, offer, trustBlock, landingDna, setSelectedSections, setCopy, approveCopy } = useLandingStore()
  // Gate de aprobación (Fase 5 C5.4): contrasta el copy generado contra la oferta y el bloque de
  // confianza. Los issues no bloquean — el usuario decide. Los de precio requieren la oferta ya
  // generada (pasa en el preview); los de confianza corren apenas hay trust_block. R7/R8 (§6.6/§6.8)
  // corren sobre landing_dna (pose única, contraste).
  const issues = copy.length ? validateSet({ offer, offer_copy: null, trust_block: trustBlock, copy, landing_dna: landingDna }) : []
  const [picked, setPicked] = useState<string[]>(selectedSections.map((t) => SECTION_LABELS[t]))
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const types = picked.map((l) => LABEL_TO_TYPE[l]).filter(Boolean)

  async function runCopy() {
    if (!sessionId || loading || types.length === 0) return
    setLoading(true)
    setError(null)
    try {
      setSelectedSections(types)
      const res = await fetch(`/api/generador-landing/sessions/${sessionId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: types, feedback: feedback.trim() || undefined }),
      })
      const data = (await res.json()) as { copy?: SectionCopy[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo generar el copy')
      setCopy(data.copy ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#a98c88]">Aparecerán en el orden en que las toques.</p>
      <ChipGroup options={OPTIONS} selected={picked} multi onChange={(v) => setPicked(v as string[])} />

      {copy.length === 0 ? (
        <button onClick={runCopy} disabled={loading || types.length === 0} className={btnPrimary}>
          {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Escribiendo copy...</> : 'Generar copy'}
        </button>
      ) : (
        <>
          <div className="flex flex-col gap-2">{copy.map((c) => <CopyCard key={c.kind} c={c} />)}</div>

          {issues.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-amber-400/90">Revisa la coherencia ({issues.length})</p>
              {issues.map((iss, i) => (
                <p key={i} className={`text-[12px] ${iss.severity === 'error' ? 'text-red-400' : 'text-amber-300/90'}`}>
                  {iss.severity === 'error' ? '● ' : '○ '}{iss.message}
                </p>
              ))}
            </div>
          )}

          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="¿Ajustar el copy? Escribe qué cambiar y regenera (opcional)"
            className="jr-field rounded-xl px-3 py-2 text-[13px]"
          />

          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

          <div className="flex gap-2">
            <button onClick={runCopy} disabled={loading} className={btnGhost}>
              {loading ? 'Regenerando...' : '↻ Regenerar copy'}
            </button>
            <button onClick={approveCopy} disabled={loading} className={btnPrimary + ' flex-1'}>Aprobar y generar</button>
          </div>
        </>
      )}

      {error && copy.length === 0 && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}
    </div>
  )
}
