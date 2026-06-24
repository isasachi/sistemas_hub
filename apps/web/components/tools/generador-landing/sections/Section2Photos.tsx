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

  function onFile(i: number, f: File) {
    setFiles((prev) => prev.map((x, j) => (j === i ? f : x)))
    setPreviews((prev) => prev.map((x, j) => (j === i ? URL.createObjectURL(f) : x)))
  }

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
      </p>
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <FileUpload key={i} label={i === 0 ? 'Foto principal' : 'Otra foto'} onFile={(f) => onFile(i, f)} preview={previews[i]} variant={i === 0 ? 'primary' : 'ghost'} />
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      <button onClick={submit} disabled={saving || !hasAny} className={btnPrimary}>
        {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Subiendo...</> : 'Continuar'}
      </button>
    </div>
  )
}
