'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import type { ReferenceAnalysis } from '@/lib/types'

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export default function Section1Reference() {
  const { sessionId, ensureSession, referenceUrl, setReferenceData, setLoading, isLoading } = useWizardStore()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(referenceUrl)
  const [error, setError] = useState<string | null>(null)

  function handleFile(f: File) {
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError(null)
  }

  async function handleSubmit() {
    if (!file || isLoading) return
    // La fila de la sesión nace ACÁ, con el primer insumo real — no al montar el wizard.
    const sessionId = await ensureSession()
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('reference', file)
      const res = await fetch(`/api/generador-anuncios/sessions/${sessionId}/analyze-reference`, { method: 'POST', body: form })
      const data = await res.json() as { analysis?: ReferenceAnalysis; referenceUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al analizar la imagen')
      setReferenceData({ referenceUrl: data.referenceUrl!, referenceAnalysis: data.analysis! })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sin intro acá: el encabezado del paso ya explica qué hace esta pantalla. */}
      <FileUpload label="Seleccionar imagen de referencia" onFile={handleFile} preview={preview} />
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">
          {error}
        </div>
      )}
      <button onClick={handleSubmit} disabled={!file || isLoading} className={btnPrimary}>
        {isLoading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analizando...</>
        ) : 'Analizar referencia →'}
      </button>
    </div>
  )
}
