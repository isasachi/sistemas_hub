'use client'

import { useState } from 'react'
import { useVideoStore } from '@/store/video'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { STEP } from '@/lib/video-ads/steps'
import { NICHES, NICHE_SPEC, NICHE_DEFAULT, type Niche } from '@/lib/video-ads/niches'
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
  // El nicho decide si el producto es un objeto que se sostiene o algo que el personaje
  // LLEVA PUESTO. Se pregunta acá y no se adivina del scan: cuando la detección se
  // equivoca el video sale mal y el usuario no tiene dónde corregirlo.
  const [niche, setNiche] = useState<Niche>(NICHE_DEFAULT)

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
      // `angle` y `problem` viajan acá también (no solo al POST de /inputs del paso
      // siguiente): sin esto se perdían al recargar entre pasos, y recuperarlos
      // obligaba a re-subir la foto y pagar de nuevo el análisis de Gemini.
      fd.append('angle', inputs.angle)
      fd.append('problem', inputs.problem)
      fd.append('niche', niche)
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/analyze-product`, { method: 'POST', body: fd })
      const data = (await res.json()) as { scan?: ProductScan; productUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo analizar el producto')
      patch({ productUrl: data.productUrl!, productScan: data.scan!, step: STEP.CHARACTER })
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
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-[#ededed]">Tipo de producto</span>
        <div className="flex flex-wrap gap-2">
          {NICHES.map((n) => (
            <button key={n} type="button" onClick={() => setNiche(n)}
              className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition ${
                niche === n
                  ? 'border-white/25 bg-white/[0.10] text-[#f1f5f9]'
                  : 'border-white/[0.08] text-[#8b8b8b] hover:text-[#cfcfcf]'
              }`}>
              {NICHE_SPEC[n].label}
            </button>
          ))}
        </div>
      </div>
      <FileUpload label="Foto del producto" accept="image/*" preview={preview}
        onFile={(f) => { setFile(f); setPreview(URL.createObjectURL(f)) }} />
      <p className="text-[12px] leading-relaxed text-[#8b8b8b]">
        {NICHE_SPEC[niche].productHint}. Es la fuente de verdad visual: forma, color,
        {NICHE_SPEC[niche].wornProduct
          ? ' tejido y detalles se conservan tal cual, y el personaje aparece usándolo.'
          : ' envase, etiqueta y tipografía se conservan tal cual.'}
        {' '}No hace falta que sea vertical.
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
