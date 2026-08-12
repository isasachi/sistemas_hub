'use client'

import { useState } from 'react'
import { useVideoStore } from '@/store/video'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import type { ProductScan } from '@/lib/video-ads/types'
import { btnPrimary, errorBox, spinner } from './shared'

// Paso 1: los INPUTS que el spec marca como fuente de verdad para producto, ángulo,
// público y problema. La foto del producto NO se valida vertical: cuando acompaña al
// personaje son dos imágenes y el ratio lo manda `aspect_ratio`, no el origen.
export default function Section1Product() {
  const { sessionId, inputs, patch, setLoading, isLoading } = useVideoStore()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof inputs, v: string) => patch({ inputs: { ...inputs, [k]: v } })
  const ready = !!file && !!inputs.productName.trim() && !!inputs.productDescription.trim()
    && !!inputs.angle.trim() && !!inputs.targetAudience.trim() && !!inputs.problem.trim()

  async function submit() {
    if (!sessionId || !file) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('product', file)
      fd.append('productName', inputs.productName)
      fd.append('whatItDoes', inputs.productDescription)
      fd.append('targetAudience', inputs.targetAudience)
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/analyze-product`, { method: 'POST', body: fd })
      const data = (await res.json()) as { scan?: ProductScan; productUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo analizar el producto')
      patch({ productUrl: data.productUrl!, productScan: data.scan!, step: 2 })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const field = (label: string, k: keyof typeof inputs, placeholder: string, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={k} className="text-[13px] font-semibold text-[#ededed]">{label}</label>
      {hint && <span className="text-[11.5px] leading-relaxed text-[#8b8b8b]">{hint}</span>}
      <input
        id={k}
        value={inputs[k]}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
        className="jr-field h-11 rounded-lg px-3 text-[13px]"
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <FileUpload label="Foto del producto" accept="image/*" preview={preview}
        onFile={(f) => { setFile(f); setPreview(URL.createObjectURL(f)) }} />
      <p className="text-[12px] leading-relaxed text-[#8b8b8b]">
        Esta foto es la fuente de verdad visual del producto: forma, envase, etiqueta,
        colores y tipografía se conservan tal cual. No hace falta que sea vertical.
      </p>
      {field('Producto', 'productName', 'Serum Eunoia')}
      {field('¿Qué es?', 'productDescription', 'Suero de niacinamida para marcas de acné')}
      {field('Ángulo del video', 'angle', 'Testimonio de resultados en 4 semanas',
        'El enfoque de venta. Reemplaza al ángulo del video original, conservando su estructura.')}
      {field('Público objetivo', 'targetAudience', 'Mujeres de 20 a 35 con piel grasa')}
      {field('Problema o deseo principal', 'problem', 'Las marcas de acné que no se van')}
      {error && <div className={errorBox}>{error}</div>}
      <button onClick={submit} disabled={!ready || isLoading} className={btnPrimary}>
        {isLoading ? <><span className={spinner} />Analizando el producto...</> : 'Continuar →'}
      </button>
    </div>
  )
}
