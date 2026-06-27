'use client'

import { useRef, useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { RegenControls } from '@/components/tools/ui/RegenControls'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section3Logo() {
  const { sessionId, logoOptions, logoUrl, setLogoOptions, setLogoReference, selectLogo, regens, setRegen } = useBrandingStore()
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refPreview, setRefPreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const sseKey = useRef(0)

  function onRefFile(f: File) {
    setRefFile(f)
    setRefPreview(URL.createObjectURL(f))
  }

  function handleEvent(e: { status: string; images?: string[]; message?: string; done?: number; total?: number; regensLeft?: number }) {
    if (e.status === 'progress' && typeof e.done === 'number' && typeof e.total === 'number') {
      setProgress({ done: e.done, total: e.total })
    }
    if (e.status === 'done' && e.images) {
      setLogoOptions(e.images)
      if (typeof e.regensLeft === 'number') setRegen('branding-logo', e.regensLeft)
      setGenerating(false)
    }
    if (e.status === 'error') {
      setError(e.message ?? 'Error al generar')
      setGenerating(false)
    }
  }

  // Sube la referencia (si hay nueva) — el backend la analiza una vez — y dispara
  // el SSE de generación. La imagen cruda NO se reusa al generar: solo sus patrones.
  async function generate() {
    if (!sessionId || saving || generating) return
    setError(null)
    setProgress(null)
    setLogoOptions([])
    setSaving(true)
    try {
      if (refFile) {
        const fd = new FormData()
        fd.append('reference', refFile)
        const res = await fetch(`/api/generador-branding/sessions/${sessionId}/logo-reference`, { method: 'POST', body: fd })
        const data = (await res.json()) as { referenceUrl?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'No se pudo subir la referencia')
        setLogoReference(data.referenceUrl ?? null)
        setRefFile(null)
      }
      setGenerating(true)
      sseKey.current += 1
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function pick(url: string) {
    if (!sessionId || picking) return
    setPicking(url)
    setError(null)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/select-logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: url }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo elegir el logo')
      selectLogo(url)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPicking(null)
    }
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Generamos varias opciones a partir de tu dirección. Elige la que más te guste.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-[#f5f5f5]">
          Logo de referencia <span className="text-[#8a8a8a] font-normal ml-1.5">(opcional)</span>
        </label>
        <p className="text-[12px] text-[#8a8a8a]">
          Ahora ve a Pinterest y busca el producto que quieres vender (ej: gomitas de creatina). Sube aquí un logo que te guste: aprendemos sus patrones, formas y espacios —no lo copiamos literal.
        </p>
        <FileUpload label="Sube un logo de referencia" onFile={onRefFile} preview={refPreview} variant="ghost" />
      </div>

      {generating && (
        <>
          <SSEStatus
            key={sseKey.current}
            url={`/api/generador-branding/sessions/${sessionId}/logo`}
            body={{ prompt: prompt.trim() || undefined }}
            onEvent={handleEvent}
          />
          <p className="text-[12px] text-[#bdbdbd]">
            {progress ? `Generando opciones... ${progress.done}/${progress.total}` : 'Generando opciones...'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`aspect-square rounded-2xl border ${
                  progress && i < progress.done
                    ? 'border-[rgba(255,156,77,0.4)] bg-[#141414]'
                    : 'border-white/[0.06] bg-[#141414] animate-pulse'
                }`}
              />
            ))}
          </div>
        </>
      )}

      {error && !generating && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {!generating && logoOptions.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {logoOptions.map((url) => {
              const isSelected = logoUrl === url
              const isPicking = picking === url
              return (
                <button
                  key={url}
                  onClick={() => pick(url)}
                  disabled={!!picking}
                  className={`relative aspect-square rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[rgba(255,156,77,0.8)] shadow-[0_0_0_2px_rgba(255,156,77,0.3)]'
                      : 'border-white/[0.08] hover:border-[rgba(255,156,77,0.5)]'
                  }`}
                >
                  <img src={url} alt="Opción de logo" className="w-full h-full object-cover" />
                  {isPicking && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                  {isSelected && !isPicking && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#ff9c4d] flex items-center justify-center text-black text-[13px] font-bold">✓</div>
                  )}
                </button>
              )
            })}
          </div>

          <RegenControls
            regensLeft={regens['branding-logo'] ?? 3}
            prompt={prompt}
            onPromptChange={setPrompt}
            onRegenerate={generate}
            busy={saving || generating}
          />
        </>
      )}

      {!generating && logoOptions.length === 0 && (
        <button onClick={generate} disabled={saving} className={btnPrimary + ' h-11 w-full'}>
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Preparando...
            </>
          ) : 'Generar logos'}
        </button>
      )}
    </div>
  )
}
