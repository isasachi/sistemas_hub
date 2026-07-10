'use client'

import { useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { FileUpload } from '@/components/tools/ui/FileUpload'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'

export default function Section2Photos() {
  const { sessionId, productPhotoUrls, setPhotos } = useLandingStore()
  // Hasta 3 slots. Cada uno: File nuevo o URL ya subida (al reanudar).
  const [files, setFiles] = useState<(File | null)[]>([null, null, null])
  const [previews, setPreviews] = useState<(string | null)[]>([
    productPhotoUrls[0] ?? null, productPhotoUrls[1] ?? null, productPhotoUrls[2] ?? null,
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dims, setDims] = useState<({ w: number; h: number } | null)[]>([null, null, null])

  // Piso de resolución: con fotos chicas el producto sale inconsistente entre secciones —
  // el detalle de las etiquetas no existe en el input y cada sección lo confabula distinto.
  // Una foto tipo 1080px sale perfecta; una de ~400px, no. Avisamos (no bloqueamos).
  const MIN_SHORT = 800

  async function onFile(i: number, f: File) {
    setFiles((prev) => prev.map((x, j) => (j === i ? f : x)))
    setPreviews((prev) => prev.map((x, j) => (j === i ? URL.createObjectURL(f) : x)))
    try {
      const bmp = await createImageBitmap(f)
      setDims((prev) => prev.map((x, j) => (j === i ? { w: bmp.width, h: bmp.height } : x)))
      bmp.close?.()
    } catch { /* si no se puede medir, no avisamos */ }
  }

  const smallPhoto = dims.find((d, i) => files[i] && d && Math.min(d.w, d.h) < MIN_SHORT) as { w: number; h: number } | undefined

  const hasAny = files.some(Boolean) || productPhotoUrls.length > 0

  async function submit() {
    if (!sessionId || saving || !hasAny) return
    setSaving(true)
    setError(null)
    try {
      const newFiles = files.filter((f): f is File => !!f)
      // Si no subió fotos nuevas pero ya había (reanudar), simplemente avanza.
      if (newFiles.length === 0 && productPhotoUrls.length > 0) { setPhotos(productPhotoUrls); return }
      const fd = new FormData()
      newFiles.forEach((f) => fd.append('photos', f))
      const res = await fetch(`/api/generador-landing/sessions/${sessionId}/photos`, { method: 'POST', body: fd })
      const data = (await res.json()) as { urls?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron subir las fotos')
      setPhotos(data.urls ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Sube 1 a 3 fotos reales de tu producto. La IA construirá cada sección alrededor de ellas — el producto se mantiene fiel.
        <span className="text-[#8a8a8a]"> Mejor una foto <strong className="text-[#bdbdbd] font-semibold">grande, nítida y de cerca</strong> del producto (lado corto ≥ 800px): de eso depende que el producto salga consistente entre secciones.</span>
      </p>
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <FileUpload key={i} label={i === 0 ? 'Foto principal' : 'Otra foto'} onFile={(f) => onFile(i, f)} preview={previews[i]} variant={i === 0 ? 'primary' : 'ghost'} />
        ))}
      </div>

      {smallPhoto && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-300/90">
          Esa foto es pequeña ({smallPhoto.w}×{smallPhoto.h}px). El texto de las etiquetas no se ve con detalle, así que el producto puede salir <strong>inconsistente entre secciones</strong>. Para mejor resultado: sube una foto más grande y nítida (lado corto ≥ 800px), o escribe las etiquetas exactas del producto en el paso <strong>“Tu producto”</strong>.
        </div>
      )}

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      <button onClick={submit} disabled={saving || !hasAny} className={btnPrimary}>
        {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Subiendo...</> : 'Continuar'}
      </button>
    </div>
  )
}
