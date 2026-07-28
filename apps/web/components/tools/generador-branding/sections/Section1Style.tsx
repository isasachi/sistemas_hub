'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { STYLE_LIST } from '@/lib/branding/style-presets'

// NOTA: este componente ya no lo usa BrandingWizard (reemplazado por
// Section2Template, Task 11 — brief primero, galería de plantillas después).
// Queda como código muerto hasta que la Task 12 lo borre; `thumbUrl` vivía en
// `effective-preset.ts` (borrado en la Task de resolver de ADN) y se inlinea
// acá solo para no romper el typecheck mientras tanto.
function thumbUrl(styleId: string): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!}/storage/v1/object/public/ad-uploads/branding-refs/thumbnails/${styleId}.png`
}

export interface AnalyzeResult {
  styleId: string
  styleName: string
  uploadedImageUrl: string
  analysis?: import('@/lib/branding/types').ExtractedStyle
}

// Paso 1: el usuario elige un estilo curado (12 presets) o sube una foto de su
// producto real (modo B — analizamos y asignamos el estilo más cercano).
export default function Section1Style({
  sessionId,
  onStyleChosen,
  onUploaded,
}: {
  sessionId: string
  onStyleChosen: (styleId: string) => void
  onUploaded: (r: AnalyzeResult) => void
}) {
  const [tab, setTab] = useState<'preset' | 'upload'>('preset')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/analyze`, { method: 'POST', body: form })
      const data = (await res.json()) as AnalyzeResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error analizando la imagen')
      onUploaded(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Elige el estilo visual de tu marca, o sube una foto de tu producto y lo basamos en él.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('preset')}
          className={`flex-1 h-9 rounded-xl text-[12px] font-semibold transition-all cursor-pointer border ${
            tab === 'preset'
              ? 'bg-[rgba(255,156,77,0.12)] border-[rgba(255,156,77,0.4)] text-[#ff9c4d]'
              : 'bg-white/[0.04] border-white/[0.06] text-[#bdbdbd] hover:text-[#f5f5f5]'
          }`}
        >
          Elegir estilo
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={`flex-1 h-9 rounded-xl text-[12px] font-semibold transition-all cursor-pointer border ${
            tab === 'upload'
              ? 'bg-[rgba(255,156,77,0.12)] border-[rgba(255,156,77,0.4)] text-[#ff9c4d]'
              : 'bg-white/[0.04] border-white/[0.06] text-[#bdbdbd] hover:text-[#f5f5f5]'
          }`}
        >
          Sube tu producto
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {tab === 'preset' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {STYLE_LIST.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onStyleChosen(p.id)}
              className="group rounded-xl overflow-hidden border border-white/[0.08] hover:border-[rgba(255,156,77,0.5)] text-left transition-colors cursor-pointer bg-[#141414]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(p.id)} alt={p.name} className="aspect-square w-full object-cover" loading="lazy" />
              <div className="p-2.5">
                <div className="text-[12px] font-semibold text-[#f5f5f5]">{p.name}</div>
                <div className="text-[11px] text-[#8a8a8a] line-clamp-2">{p.essence}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/[0.1] rounded-2xl p-10 cursor-pointer hover:border-[rgba(255,156,77,0.5)] transition-colors bg-[#141414]">
          <Upload className="w-7 h-7 text-[#8a8a8a]" />
          <span className="text-[13px] text-[#8a8a8a] text-center">
            {busy ? 'Analizando tu producto...' : 'Sube una foto de tu mockup/packaging para basar la marca en él'}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
      )}
    </div>
  )
}
