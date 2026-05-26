'use client'

import { useState, useRef } from 'react'
import { useWizardStore } from '@/store/wizard'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'

const STATUS_LABELS: Record<string, { text: string; pct: number }> = {
  building_prompt: { text: 'Preparando instrucciones...', pct: 15 },
  loading_images:  { text: 'Cargando imágenes...', pct: 30 },
  generating:      { text: 'Generando el anuncio con IA...', pct: 60 },
  uploading:       { text: 'Guardando imagen final...', pct: 90 },
  done:            { text: '¡Listo!', pct: 100 },
}

const STAGES = ['building_prompt', 'loading_images', 'generating', 'uploading', 'done']

const btnPrimary = 'rounded-xl text-white text-[13px] font-bold bg-brand-gradient hover:opacity-90 disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section5Generate() {
  const { sessionId, imageUrl, setImageUrl, startNewSession } = useWizardStore()
  const [status, setStatus] = useState<string>('building_prompt')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const sseKey = useRef(0)

  function handleEvent(event: { status: string; imageUrl?: string; message?: string }) {
    const info = STATUS_LABELS[event.status]
    if (info) setProgress(info.pct)
    setStatus(event.status)
    if (event.status === 'done' && event.imageUrl) setImageUrl(event.imageUrl)
    if (event.status === 'error') setError(event.message ?? 'Error al generar')
  }

  async function handleDownload() {
    if (!imageUrl) return
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `anuncio-${Date.now()}.png`; a.click()
      URL.revokeObjectURL(url)
    } catch { window.open(imageUrl, '_blank') }
  }

  async function handleRefine() {
    if (!sessionId || !feedback.trim() || refining) return
    setRefining(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/refine-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedback.trim() }),
      })
      const data = await res.json() as { imageUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al aplicar cambios')
      setImageUrl(data.imageUrl!)
      setFeedback('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRefining(false)
    }
  }

  if (!sessionId) return null

  const isGenerating = !imageUrl && !error

  return (
    <div className="flex flex-col gap-4">
      {isGenerating && (
        <>
          <SSEStatus
            key={sseKey.current}
            url={`/api/sessions/${sessionId}/generate-image`}
            onEvent={handleEvent}
          />
          <p className="text-[13px] text-[#94a3b8]">Esto puede tomar entre 15 y 40 segundos.</p>

          {/* Progress bar with stage indicators */}
          <div>
            <div className="flex justify-between text-[11px] text-[#94a3b8] mb-1.5">
              <span>{STATUS_LABELS[status]?.text ?? status}</span>
              <span className="text-[#f59e0b] font-bold">{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#f59e0b 0%,#ef4444 100%)' }}
              />
            </div>
            <div className="flex gap-1">
              {STAGES.map((s) => {
                const idx = STAGES.indexOf(s)
                const currentIdx = STAGES.indexOf(status)
                return (
                  <div
                    key={s}
                    className="flex-1 h-[2px] rounded-full transition-colors duration-500"
                    style={{
                      background:
                        idx < currentIdx ? '#22c55e' :
                        idx === currentIdx ? 'linear-gradient(90deg,#f59e0b,#ef4444)' :
                        'rgba(255,255,255,0.08)',
                    }}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-[9px] text-[#475569] mt-1">
              <span>prompt</span><span>imágenes</span><span>generando</span><span>guardando</span><span>listo</span>
            </div>
          </div>

          {/* Skeleton */}
          <div className="aspect-[9/16] max-h-[300px] rounded-2xl bg-[#131320] animate-pulse border border-white/[0.06] flex items-center justify-center">
            <span className="text-[#475569] text-[12px]">generando...</span>
          </div>
        </>
      )}

      {error && !imageUrl && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
          <button
            onClick={() => { setError(null); setProgress(0); setStatus('building_prompt'); sseKey.current += 1 }}
            className={btnPrimary + ' h-11 w-full'}
          >
            Reintentar
          </button>
        </div>
      )}

      {imageUrl && (
        <div className="flex flex-col gap-4">
          <img src={imageUrl} alt="Anuncio generado" className="w-full rounded-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,.6)]" />
          <div className="flex gap-3">
            <button onClick={handleDownload} className={btnPrimary + ' flex-1 h-11'}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Descargar
            </button>
            <button onClick={startNewSession} className="h-11 px-4 rounded-xl border border-white/[0.14] text-[#f1f5f9] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent">
              Nuevo anuncio
            </button>
          </div>
          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#475569] mb-2">¿Quieres ajustar algo?</p>
            {error && <div className="mb-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">{error}</div>}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej: fondo más oscuro, CTA más grande..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !refining && handleRefine()}
                className="flex-1 h-10 rounded-xl border border-white/[0.08] bg-[#080810] px-3 text-[13px] text-[#f1f5f9] placeholder:text-[#475569] focus:outline-none focus:border-[rgba(245,158,11,0.5)] transition-colors"
              />
              <button
                onClick={handleRefine}
                disabled={!feedback.trim() || refining}
                className={btnPrimary + ' h-10 px-4 shrink-0'}
              >
                {refining ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
