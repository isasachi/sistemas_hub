'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
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
        border: selected ? '2px solid rgba(232,70,122,0.6)' : '1px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(232,70,122,0.04)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#a98c88]">{label}</span>
        {recommended && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[rgba(232,70,122,0.1)] text-[#e8467a] border border-[rgba(232,70,122,0.2)]">
            ★ Recomendada
          </span>
        )}
        {selected && <Check className="ml-auto w-3.5 h-3.5 text-[#e8467a]" strokeWidth={3} />}
      </div>
      <div className="px-4 divide-y divide-white/[0.04]">
        {elements.map((el) => (
          <div key={el.element} className="py-2.5 flex gap-3 items-start">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#a98c88] w-16 mt-0.5">{el.element}</span>
            <span className="text-[12px] text-[#efe7e0] leading-relaxed">&ldquo;{el.text}&rdquo;</span>
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

  // La regla del prompt dice que si ningún comentario aporta palabras propias, B
  // copia A — y entonces salían dos tarjetas idénticas, con B marcada
  // "Recomendada" y el texto prometiendo "las palabras exactas de tu audiencia".
  // ponytail: comparación literal; si difieren en un espacio, se tratan como
  // distintas, que es el lado seguro (se muestra la promesa solo cuando B es
  // realmente otra versión).
  const iguales =
    JSON.stringify(copyVersions.versionA) === JSON.stringify(copyVersions.versionB)

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
      <p className="text-[13px] text-[#c9b4ae]">
        {iguales
          ? 'Las dos versiones salieron iguales: los comentarios que pegaste no aportaron frases propias que sirvieran para reescribir el copy. Elige cualquiera, o vuelve atrás y pega comentarios con más texto.'
          : 'La versión B usa las palabras exactas de tu audiencia. Ambas mantienen la estructura del anuncio original.'}
      </p>
      <CopyCard version="A" label="Versión A" elements={copyVersions.versionA} selected={selected === 'A'} onPick={() => setSelected('A')} />
      <CopyCard version="B" label="Versión B" recommended={!iguales} elements={copyVersions.versionB} selected={selected === 'B'} onPick={() => setSelected('B')} />
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
