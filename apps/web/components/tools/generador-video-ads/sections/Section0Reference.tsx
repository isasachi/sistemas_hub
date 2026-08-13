'use client'

import { useRef, useState } from 'react'
import { useVideoStore } from '@/store/video'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { uploadDirect, measureAsset, isPortrait, MAX_VIDEO_MB } from '@/lib/video-ads/upload-client'
import { STEP } from '@/lib/video-ads/steps'
import type { ForensicReport } from '@/lib/video-ads/types'
import { btnPrimary, errorBox, warnBox, spinner } from './shared'

// Paso 0: el VIDEO ORIGINAL. El spec lo exige siempre — es la fuente de verdad de
// estructura, ritmo, cámara y orden. Sin él no hay pipeline.
export default function Section0Reference() {
  const { sessionId, patch, setLoading, isLoading } = useVideoStore()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notVertical, setNotVertical] = useState<string | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const pickToken = useRef(0)

  async function pick(f: File) {
    if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`El video pesa más de ${MAX_VIDEO_MB} MB. Recórtalo o bájale la calidad.`)
      return
    }
    setFile(f); setPreview(URL.createObjectURL(f))
    setError(null); setNotVertical(null); setMeasuring(true)
    const token = ++pickToken.current
    const dims = await measureAsset(f)
    if (token !== pickToken.current) return
    setNotVertical(
      isPortrait(dims) ? null
        : `Ese video es horizontal (${dims!.w}×${dims!.h}). El anuncio se genera vertical (9:16): recórtalo vertical y vuelve a subirlo.`,
    )
    setMeasuring(false)
  }

  async function analyze() {
    if (!sessionId || !file) return
    setLoading(true); setError(null)
    try {
      const videoUrl = await uploadDirect(sessionId, 'reference-video', file)
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/analyze-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      })
      const data = (await res.json()) as { analysis?: ForensicReport; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo analizar el video')
      patch({ referenceVideoUrl: videoUrl, forensicAnalysis: data.analysis!, step: STEP.PRODUCT })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {preview && (
        <video src={preview} controls playsInline className="max-h-72 w-full rounded-2xl border border-white/[0.08] bg-black object-contain" />
      )}
      <FileUpload
        label={`Seleccionar video (máx ${MAX_VIDEO_MB} MB)`}
        accept="video/mp4,video/quicktime,video/webm"
        onFile={pick}
        preview={null}
      />
      <p className="text-[12px] leading-relaxed text-[#8b8b8b]">
        Tiene que ser <strong className="font-semibold text-[#cfcfcf]">vertical</strong> (9:16).
        De este video sale toda la estructura: cortes, ritmo, cámara y orden de las frases.
      </p>
      {notVertical && <div className={warnBox}>{notVertical}</div>}
      {error && <div className={errorBox}>{error}</div>}
      <button onClick={analyze} disabled={!file || isLoading || measuring || !!notVertical} className={btnPrimary}>
        {isLoading ? <><span className={spinner} />Analizando corte por corte...</>
          : measuring ? <><span className={spinner} />Revisando el formato...</>
          : 'Analizar referencia →'}
      </button>
    </div>
  )
}
