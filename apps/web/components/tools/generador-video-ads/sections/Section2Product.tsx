'use client'

import { useState } from 'react'
import { useVideoStore } from '@/store/video'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import type { ProductScan } from '@/lib/video-ads/types'
import { btnPrimary, errorBox, spinner } from './shared'

export default function Section2Product() {
  const { sessionId, productUrl, productName, whatItDoes, targetAudience, patch, setLoading, isLoading } = useVideoStore()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(productUrl)
  const [name, setName] = useState(productName ?? '')
  const [does, setDoes] = useState(whatItDoes ?? '')
  const [audience, setAudience] = useState(targetAudience ?? '')
  const [error, setError] = useState<string | null>(null)

  const ready = !!file && !!name.trim() && !!does.trim() && !!audience.trim()

  async function submit() {
    if (!sessionId || !ready || isLoading) return
    setLoading(true); setError(null)
    try {
      const form = new FormData()
      form.append('product', file!)
      form.append('productName', name.trim())
      form.append('whatItDoes', does.trim())
      form.append('targetAudience', audience.trim())
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/analyze-product`, { method: 'POST', body: form })
      const data = (await res.json()) as { scan?: ProductScan; productUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo analizar el producto')
      patch({
        productUrl: data.productUrl!, productScan: data.scan!,
        productName: name.trim(), whatItDoes: does.trim(), targetAudience: audience.trim(),
        step: 3,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FileUpload label="Seleccionar foto del producto" onFile={(f) => { setFile(f); setPreview(URL.createObjectURL(f)); setError(null) }} preview={preview} />

      <div className="flex flex-col gap-2">
        <label htmlFor="p-name" className="text-[13px] font-semibold text-[#ededed]">¿Cómo se llama?</label>
        <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Serum de crecimiento capilar" className="jr-field h-11 rounded-lg px-3 text-[13px]" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="p-does" className="text-[13px] font-semibold text-[#ededed]">¿Qué hace?</label>
        <textarea id="p-does" rows={3} value={does} onChange={(e) => setDoes(e.target.value)} placeholder="Reduce la caída del cabello en 8 semanas de uso diario" className="jr-field rounded-lg px-3 py-2.5 text-[13px]" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="p-aud" className="text-[13px] font-semibold text-[#ededed]">¿A quién le hablas?</label>
        <input id="p-aud" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Mujeres de 30 a 45 con caída post parto" className="jr-field h-11 rounded-lg px-3 text-[13px]" />
      </div>

      {error && <div className={errorBox}>{error}</div>}
      <button onClick={submit} disabled={!ready || isLoading} className={btnPrimary}>
        {isLoading ? <><span className={spinner} />Analizando producto...</> : 'Continuar →'}
      </button>
    </div>
  )
}
