'use client'

import { useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import type { Direction } from '@/lib/branding/types'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section2Direction() {
  const {
    sessionId, direction, setDirection, approveDirection,
    brandName, productCategory, targetAudience, personality, briefNotes,
  } = useBrandingStore()
  const [feedback, setFeedback] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!direction) return null

  async function regenerate() {
    if (!sessionId || regenerating) return
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/direction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName, productCategory, targetAudience, personality, briefNotes,
          feedback: feedback.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { direction?: Direction; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al regenerar')
      setDirection(data.direction!)
      setFeedback('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-[#bdbdbd]">{direction.summaryForUser}</p>

      {/* Concepto */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a] mb-1">Concepto</p>
        <p className="text-[15px] font-semibold text-[#f5f5f5]">{direction.concept}</p>
        <p className="text-[12px] text-[#bdbdbd] mt-1">{direction.rationale}</p>
      </div>

      {/* Paleta */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a] mb-2">Paleta</p>
        <div className="flex flex-col gap-2">
          {direction.palette.map((c) => (
            <div key={c.hex} className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg border border-white/[0.12] shrink-0"
                style={{ backgroundColor: c.hex }}
              />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#f5f5f5]">
                  {c.name} <span className="text-[#8a8a8a] font-mono font-normal">{c.hex.toUpperCase()}</span>
                </p>
                <p className="text-[11px] text-[#bdbdbd] truncate">{c.usage}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tipografía */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a] mb-1">Tipografía</p>
        <p className="text-[13px] text-[#f5f5f5]">
          <span className="font-semibold">Titulares:</span> {direction.typography.headline}
          <span className="mx-2 text-[#8a8a8a]">·</span>
          <span className="font-semibold">Cuerpo:</span> {direction.typography.body}
        </p>
        <p className="text-[12px] text-[#bdbdbd] mt-1">{direction.typography.rationale}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {/* Ajustar */}
      <div className="border-t border-white/[0.06] pt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a] mb-2">¿Ajustar el rumbo?</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ej: más colorido, menos serio, tonos tierra..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !regenerating && regenerate()}
            className="flex-1 h-10 rounded-xl border border-white/[0.06] bg-[#0a0a0a] px-3 text-[13px] text-[#f5f5f5] placeholder:text-[#8a8a8a] focus:outline-none focus:border-[rgba(255,156,77,0.5)] transition-colors"
          />
          <button onClick={regenerate} disabled={regenerating} className={btnPrimary + ' h-10 px-4 shrink-0'}>
            {regenerating ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Regenerar'}
          </button>
        </div>
      </div>

      <button onClick={approveDirection} disabled={regenerating} className={btnPrimary + ' h-11 w-full'}>
        Aprobar dirección y generar logos →
      </button>
    </div>
  )
}
