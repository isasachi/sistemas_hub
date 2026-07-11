'use client'

import { useRef, useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { RegenControls } from '@/components/tools/ui/RegenControls'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

const STATUS_TEXT: Record<string, string> = {
  loading_images: 'Cargando etiqueta y envase...',
  building_container: 'Preparando el envase...',
  generating: 'Montando el producto...',
  uploading: 'Guardando...',
}

export default function Section5Mockup() {
  const { sessionId, mockupUrl, labelData, setContainer, setMockup, regens, setRegen } = useBrandingStore()
  const [mode, setMode] = useState<'describe' | 'upload'>('describe')
  // Prefill con el formato de empaque ya indicado en el paso de la etiqueta.
  const [desc, setDesc] = useState(labelData?.packagingFormat ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('generating')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const sseKey = useRef(0)

  function onFile(f: File) {
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function handleEvent(e: { status: string; imageUrl?: string; message?: string; regensLeft?: number }) {
    setStatus(e.status)
    if (e.status === 'done' && e.imageUrl) {
      setResult(e.imageUrl)
      if (typeof e.regensLeft === 'number') setRegen('branding-mockup', e.regensLeft)
      setGenerating(false)
    }
    if (e.status === 'error') {
      setError(e.message ?? 'Error al generar')
      setGenerating(false)
    }
  }

  const canGenerate = mode === 'describe' ? !!desc.trim() : !!file

  async function generate() {
    if (!sessionId || !canGenerate || saving || generating) return
    setError(null)
    setResult(null)
    setSaving(true)
    try {
      // Fase 1: persistir el envase (multipart si es upload, JSON si es descripción).
      let res: Response
      if (mode === 'upload' && file) {
        const fd = new FormData()
        fd.append('container', file)
        if (desc.trim()) fd.append('containerDesc', desc.trim())
        res = await fetch(`/api/generador-branding/sessions/${sessionId}/container`, { method: 'POST', body: fd })
      } else {
        res = await fetch(`/api/generador-branding/sessions/${sessionId}/container`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ containerDesc: desc.trim() }),
        })
      }
      const data = (await res.json()) as { containerUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el envase')
      setContainer({ containerMode: mode, containerDesc: desc.trim() || null, containerUrl: data.containerUrl ?? null })

      // Fase 2: generar el mockup vía SSE.
      setStatus('generating')
      setGenerating(true)
      sseKey.current += 1
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!sessionId) return null

  const tab = (m: 'describe' | 'upload', label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`flex-1 h-9 rounded-xl text-[12px] font-semibold transition-all cursor-pointer border ${
        mode === m
          ? 'bg-[rgba(255,156,77,0.12)] border-[rgba(255,156,77,0.4)] text-[#ff9c4d]'
          : 'bg-white/[0.04] border-white/[0.06] text-[#bdbdbd] hover:text-[#f5f5f5]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Por último, monta tu etiqueta en el envase real para ver el producto terminado.
      </p>

      <div className="flex gap-2">
        {tab('describe', 'Describir envase')}
        {tab('upload', 'Subir imagen')}
      </div>

      {mode === 'describe' ? (
        <textarea
          placeholder="Ej: pote cilíndrico de plástico transparente con tapa negra, tipo frasco de suplementos, 250ml"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          className="jr-field rounded-xl px-3 py-2.5 text-[13px] resize-none"
        />
      ) : (
        <FileUpload label="Sube una foto del envase" onFile={onFile} preview={preview} />
      )}

      {generating && (
        <>
          <SSEStatus
            key={sseKey.current}
            url={`/api/generador-branding/sessions/${sessionId}/mockup`}
            body={{ prompt: prompt.trim() || undefined }}
            onEvent={handleEvent}
          />
          <p className="text-[12px] text-[#bdbdbd]">{STATUS_TEXT[status] ?? 'Generando...'}</p>
          <div className="aspect-square max-h-[340px] rounded-2xl bg-[#141414] animate-pulse border border-white/[0.06]" />
        </>
      )}

      {error && !generating && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {result && !generating && (
        <>
          <img src={result} alt="Mockup del producto" className="w-full rounded-2xl border border-white/[0.08]" />
          <button onClick={() => setMockup(result)} className={btnPrimary + ' h-11 w-full'}>
            Ver guía de marca →
          </button>
          <RegenControls
            regensLeft={regens['branding-mockup'] ?? 3}
            prompt={prompt}
            onPromptChange={setPrompt}
            onRegenerate={generate}
            busy={saving || generating}
          />
        </>
      )}

      {!generating && !result && (
        <button onClick={generate} disabled={!canGenerate || saving} className={btnPrimary + ' h-11 w-full'}>
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Preparando...
            </>
          ) : mockupUrl ? 'Generar nuevo mockup' : 'Generar mockup'}
        </button>
      )}
    </div>
  )
}
