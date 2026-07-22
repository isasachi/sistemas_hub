'use client'

import { useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { RegenControls } from '@/components/tools/ui/RegenControls'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

// Mockup: fetch JSON simple (ya no SSE) — el tipo de envase viene del brief
// (paso 2) y la etiqueta ya elegida, sin datos adicionales del usuario mid-flow.
// `onUse` (provisto por BrandingWizard) persiste el step en la sesión antes de
// confirmar el mockup — ver nota de high-water mark en BrandingWizard.
export default function Section6Mockup({ onUse }: { onUse: (url: string) => void }) {
  const { sessionId, mockupUrl, regens, setRegen } = useBrandingStore()
  const [generating, setGenerating] = useState(false)
  // Si la sección se reabre (remount) y ya hay un mockup generado en la sesión,
  // mostrarlo en vez de forzar otra generación pagada de Gemini.
  const [result, setResult] = useState<string | null>(mockupUrl)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')

  async function generate() {
    if (!sessionId || generating) return
    setError(null)
    setResult(null)
    setGenerating(true)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/mockup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() || undefined }),
      })
      const data = (await res.json()) as { url?: string; regensLeft?: number; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'No se pudo generar el mockup')
      setResult(data.url)
      if (typeof data.regensLeft === 'number') setRegen('branding-mockup', data.regensLeft)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Por último, montamos tu etiqueta en el envase para ver el producto terminado.
      </p>

      {generating && (
        <>
          <p className="text-[12px] text-[#bdbdbd]">Montando el producto...</p>
          <div className="aspect-square max-h-[340px] rounded-2xl bg-[#141414] animate-pulse border border-white/[0.06]" />
        </>
      )}

      {error && !generating && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {result && !generating && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result} alt="Mockup del producto" className="w-full rounded-2xl border border-white/[0.08]" />
          <button onClick={() => onUse(result)} className={btnPrimary + ' h-11 w-full'}>
            Ver guía de marca →
          </button>
          <RegenControls
            regensLeft={regens['branding-mockup'] ?? 3}
            prompt={prompt}
            onPromptChange={setPrompt}
            onRegenerate={generate}
            busy={generating}
          />
        </>
      )}

      {!generating && !result && (
        <button onClick={generate} className={btnPrimary + ' h-11 w-full'}>
          {mockupUrl ? 'Generar nuevo mockup' : 'Generar mockup'}
        </button>
      )}
    </div>
  )
}
