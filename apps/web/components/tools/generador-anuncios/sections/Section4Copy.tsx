'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import type { CopyElement } from '@/lib/types'

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

function CopyCard({
  version,
  label,
  recommended,
  elements,
  selected,
  onPick,
}: {
  version: 'A' | 'B'
  label: string
  recommended?: boolean
  elements: CopyElement[]
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full text-left rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        border: selected ? '2px solid rgba(255,156,77,0.6)' : '1px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(255,156,77,0.04)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">{label}</span>
        {recommended && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[rgba(255,156,77,0.1)] text-[#ff9c4d] border border-[rgba(255,156,77,0.2)]">
            ★ Recomendada
          </span>
        )}
        {selected && <span className="ml-auto text-[#ff9c4d] text-[11px]">✓</span>}
      </div>
      <div className="px-4 divide-y divide-white/[0.04]">
        {elements.map((el) => (
          <div key={el.element} className="py-2.5 flex gap-3 items-start">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#8a8a8a] w-16 mt-0.5">{el.element}</span>
            <span className="text-[12px] text-[#f5f5f5] leading-relaxed">&ldquo;{el.text}&rdquo;</span>
          </div>
        ))}
      </div>
    </button>
  )
}

export default function Section4Copy() {
  const { sessionId, copyVersions, setConfirmedCopy, setLoading, isLoading } = useWizardStore()
  const [selected, setSelected] = useState<'A' | 'B' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!copyVersions) return null

  async function handleConfirm() {
    if (!sessionId || !selected || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-anuncios/sessions/${sessionId}/confirm-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: selected }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al confirmar')
      const breakdown = selected === 'A' ? copyVersions!.versionA : copyVersions!.versionB
      setConfirmedCopy({ version: selected, breakdown })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Versión B usa las palabras exactas de tu audiencia. Ambas mantienen la estructura del anuncio original.
      </p>
      <CopyCard version="A" label="Versión A" elements={copyVersions.versionA} selected={selected === 'A'} onPick={() => setSelected('A')} />
      <CopyCard version="B" label="Versión B" recommended elements={copyVersions.versionB} selected={selected === 'B'} onPick={() => setSelected('B')} />
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}
      <button onClick={handleConfirm} disabled={!selected || isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Confirmando...</>
        ) : `Confirmar Versión ${selected ?? '...'} →`}
      </button>
    </div>
  )
}
