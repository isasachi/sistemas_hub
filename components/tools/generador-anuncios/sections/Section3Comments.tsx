'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import type { CopyVersions } from '@/lib/types'

const TIKTOK_SCRIPT = `Busca en TikTok videos sobre el problema que resuelve tu producto.
Abre 2–3 videos con muchos comentarios.
Copia y pega aquí los comentarios tal como están — con errores, emojis y todo.

Eso es lo que voy a usar para escribir el texto de tu anuncio con las palabras exactas de tu audiencia. Entre más reales, mejor.`

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section3Comments() {
  const { sessionId, setCopyVersions, setLoading, isLoading } = useWizardStore()
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!sessionId || !comments.trim() || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments }),
      })
      const data = await res.json() as { copyVersions?: CopyVersions; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al generar el copy')
      setCopyVersions(data.copyVersions!)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0a] px-4 py-4">
        <pre className="text-[12px] text-[#bdbdbd] whitespace-pre-wrap font-sans leading-relaxed">{TIKTOK_SCRIPT}</pre>
      </div>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        rows={7}
        placeholder="Pega aquí los comentarios..."
        className="rounded-xl border border-white/[0.06] bg-[#0a0a0a] px-4 py-3 text-[13px] text-[#f5f5f5] placeholder:text-[#8a8a8a] resize-none focus:outline-none focus:border-[rgba(255,156,77,0.5)] transition-colors"
      />
      {isLoading && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[11px] text-[#bdbdbd]">
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
      <button onClick={handleSubmit} disabled={!comments.trim() || isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generando versiones...</>
        ) : 'Generar copy del anuncio →'}
      </button>
    </div>
  )
}
