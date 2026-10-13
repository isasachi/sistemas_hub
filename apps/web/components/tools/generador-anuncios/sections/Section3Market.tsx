'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import type { CopyVersions } from '@/lib/types'
import type { MarketResearch } from '@/lib/anuncios/schemas'

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

function Chips({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#a98c88]">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((k) => (
          <span key={k} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[12px] text-[#efe7e0]">{k}</span>
        ))}
      </div>
    </div>
  )
}

// La investigación ya llegó con el paso del producto (corre en paralelo con su análisis), así que
// esta pantalla no espera nada: muestra con qué palabras se va a escribir y dispara el copy.
export default function Section3Market() {
  const { sessionId, marketResearch, setCopyVersions, setMarketResearch, setLoading, isLoading } = useWizardStore()
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!sessionId || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-anuncios/sessions/${sessionId}/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() || undefined }),
      })
      const data = await res.json() as { copyVersions?: CopyVersions; research?: MarketResearch | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al generar el copy')
      if (data.research) setMarketResearch(data.research)
      setCopyVersions(data.copyVersions!)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {marketResearch ? (
        <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-[#14050a] px-4 py-4">
          <p className="text-[13px] text-[#c9b4ae]">
            Nicho: <span className="font-semibold text-[#f6f2eb]">{marketResearch.niche}</span>
          </p>
          <Chips title="Lo que busca tu mercado" items={marketResearch.keywords} />
          <Chips title="Cómo nombra su problema" items={marketResearch.pains} />
          <Chips title="Lo que espera conseguir" items={marketResearch.desires} />
        </div>
      ) : (
        // Sesiones anteriores a la investigación, o una en la que no llegó: se hace junto con el copy.
        <div className="rounded-xl border border-white/[0.06] bg-[#14050a] px-4 py-4 text-[13px] text-[#c9b4ae]">
          Investigamos las palabras de tu mercado al escribir el copy.
        </div>
      )}
      {isLoading && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[11px] text-[#c9b4ae]">
            <span>Generando copy A/B...</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-brand-gradient animate-pulse" />
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="Opcional: ajuste para el copy — ej: más directo, tono juvenil"
        className="jr-field rounded-xl px-4 py-3 text-[13px] resize-none"
      />
      <button onClick={handleSubmit} disabled={isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando versiones...</>
        ) : 'Generar copy del anuncio →'}
      </button>
    </div>
  )
}
