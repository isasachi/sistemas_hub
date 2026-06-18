'use client'

import { useRef, useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

const STATUS_TEXT: Record<string, string> = {
  loading_images: 'Cargando el logo...',
  generating: 'Diseñando la etiqueta...',
  uploading: 'Guardando...',
}

export default function Section4Label() {
  const { sessionId, labelUrl, setLabel } = useBrandingStore()
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('generating')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sseKey = useRef(0)

  function handleEvent(e: { status: string; imageUrl?: string; message?: string }) {
    setStatus(e.status)
    if (e.status === 'done' && e.imageUrl) {
      setResult(e.imageUrl)
      setGenerating(false)
    }
    if (e.status === 'error') {
      setError(e.message ?? 'Error al generar')
      setGenerating(false)
    }
  }

  function generate() {
    if (!brief.trim() || generating) return
    setError(null)
    setResult(null)
    setStatus('generating')
    setGenerating(true)
    sseKey.current += 1
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Describe qué va en la etiqueta: nombre del producto, sabor/variedad, un eslogan, lo que destaque.
      </p>

      <textarea
        placeholder="Ej: Gomitas de fruta natural, sabor maracuyá, sin azúcar añadida, 100g"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        className="rounded-xl border border-white/[0.06] bg-[#141414] px-3 py-2.5 text-[13px] text-[#f5f5f5] placeholder:text-[#8a8a8a] focus:outline-none focus:border-[rgba(255,156,77,0.5)] transition-colors resize-none"
      />

      {generating && (
        <>
          <SSEStatus
            key={sseKey.current}
            url={`/api/generador-branding/sessions/${sessionId}/label`}
            body={{ labelBrief: brief.trim() }}
            onEvent={handleEvent}
          />
          <p className="text-[12px] text-[#bdbdbd]">{STATUS_TEXT[status] ?? 'Generando...'}</p>
          <div className="aspect-square max-h-[320px] rounded-2xl bg-[#141414] animate-pulse border border-white/[0.06]" />
        </>
      )}

      {error && !generating && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {result && !generating && (
        <>
          <img src={result} alt="Etiqueta generada" className="w-full rounded-2xl border border-white/[0.08]" />
          <div className="flex gap-3">
            <button onClick={() => setLabel({ labelBrief: brief.trim(), labelUrl: result })} className={btnPrimary + ' flex-1 h-11'}>
              Usar esta etiqueta →
            </button>
            <button
              onClick={generate}
              className="h-11 px-4 rounded-xl border border-white/[0.14] text-[#f5f5f5] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent"
            >
              ↻ Regenerar
            </button>
          </div>
        </>
      )}

      {!generating && !result && (
        <button onClick={generate} disabled={!brief.trim()} className={btnPrimary + ' h-11 w-full'}>
          {labelUrl ? 'Generar nueva etiqueta' : 'Generar etiqueta'}
        </button>
      )}
    </div>
  )
}
