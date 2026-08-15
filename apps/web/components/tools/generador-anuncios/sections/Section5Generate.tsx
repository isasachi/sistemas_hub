'use client'

import { useState, useRef } from 'react'
import { useWizardStore } from '@/store/wizard'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'
import { RegenControls } from '@/components/tools/ui/RegenControls'
import { GenerationProgress } from '@/components/tools/ui/GenerationProgress'
import BackToDashboard from '@/components/tools/ui/BackToDashboard'

// El orden es imágenes → prompt: el instructivo necesita el ratio real de la referencia,
// que sale de sus bytes. Si se invierte acá, la barra retrocede.
const STATUS_LABELS: Record<string, { text: string; pct: number }> = {
  loading_images:  { text: 'Cargando imágenes...', pct: 15 },
  building_prompt: { text: 'Preparando instrucciones...', pct: 30 },
  generating:      { text: 'Generando el anuncio con IA...', pct: 60 },
  uploading:       { text: 'Guardando imagen final...', pct: 90 },
  done:            { text: '¡Listo!', pct: 100 },
}

const STAGES = ['loading_images', 'building_prompt', 'generating', 'uploading', 'done']

const btnPrimary = 'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section5Generate() {
  const { sessionId, imageUrl, setImageUrl, startNewSession, regens, setRegen } = useWizardStore()
  const [status, setStatus] = useState<string>('loading_images')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const sseKey = useRef(0)

  function handleEvent(event: { status: string; imageUrl?: string; message?: string; regensLeft?: number }) {
    const info = STATUS_LABELS[event.status]
    if (info) setProgress(info.pct)
    setStatus(event.status)
    if (event.status === 'done' && event.imageUrl) {
      setImageUrl(event.imageUrl)
      if (typeof event.regensLeft === 'number') setRegen('anuncios-image', event.regensLeft)
    }
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
    if (!sessionId || refining) return
    setRefining(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-anuncios/sessions/${sessionId}/refine-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedback.trim() }),
      })
      const data = await res.json() as { imageUrl?: string; regensLeft?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al aplicar cambios')
      setImageUrl(data.imageUrl!)
      if (typeof data.regensLeft === 'number') setRegen('anuncios-image', data.regensLeft)
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
            url={`/api/generador-anuncios/sessions/${sessionId}/generate-image`}
            onEvent={handleEvent}
          />
          <p className="text-[13px] text-[#cfcfcf]">Esto puede tomar entre 15 y 40 segundos.</p>

          {/* Momento de generación unificado (compartido con landing) */}
          <GenerationProgress
            percent={progress}
            label={STATUS_LABELS[status]?.text ?? status}
            steps={['imágenes', 'prompt', 'generando', 'guardando', 'listo']}
            currentStep={STAGES.indexOf(status)}
          />

          {/* Skeleton */}
          <div className="aspect-[9/16] max-h-[300px] rounded-2xl bg-[#121214] animate-pulse border border-white/[0.06] flex items-center justify-center">
            <span className="text-[#bebebe] text-[12px]">generando...</span>
          </div>
        </>
      )}

      {error && !imageUrl && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
          <button
            onClick={() => { setError(null); setProgress(0); setStatus('loading_images'); sseKey.current += 1 }}
            className={btnPrimary + ' h-11 w-full'}
          >
            Reintentar
          </button>
        </div>
      )}

      {imageUrl && (
        <div className="flex flex-col gap-4">
          <img src={imageUrl} alt="Anuncio generado" className="w-full rounded-2xl border border-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,.6)]" />
          <div className="flex gap-3">
            <button onClick={handleDownload} className={btnPrimary + ' flex-1 h-11'}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Descargar
            </button>
            <button onClick={startNewSession} className="h-11 px-4 rounded-xl border border-white/[0.14] text-[#ededed] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent">
              Nuevo anuncio
            </button>
          </div>
          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#bebebe] mb-2">¿Quieres ajustar algo?</p>
            {error && <div className="mb-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">{error}</div>}
            <RegenControls
              regensLeft={regens['anuncios-image'] ?? 3}
              prompt={feedback}
              onPromptChange={setFeedback}
              onRegenerate={handleRefine}
              busy={refining}
              label="↻ Regenerar anuncio"
            />
          </div>
          <BackToDashboard className="self-start" />
        </div>
      )}
    </div>
  )
}
