'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { useBrandingStore } from '@/store/branding'
import {
  CATEGORIES, TEMPLATES, matchTemplates, isSameProduct, templateImageUrl, getTemplate,
} from '@/lib/branding/templates'
import { TEMPLATE_DNA } from '@/lib/branding/template-dna'
import type { ExtractedStyle, PaletteColor } from '@/lib/branding/types'

export interface AnalyzeResult {
  uploadedImageUrl: string
  analysis: ExtractedStyle
  paletteOptions: PaletteColor[][]
}

// Paso 2: el usuario elige una de las 30 plantillas (agrupadas por categoría, la
// suya primero, las que matchean su producto resaltadas) o sube su propia
// referencia. Al elegir una plantilla aparecen sus 3 paletas como chips.
export default function Section2Template({
  sessionId,
  onTemplateChosen,
  onUploaded,
}: {
  sessionId: string
  onTemplateChosen: (templateId: string, paletteVariant: number) => void
  onUploaded: (r: AnalyzeResult) => void
}) {
  const { categoryId, productType } = useBrandingStore()
  const [tab, setTab] = useState<'template' | 'upload'>('template')
  const [picked, setPicked] = useState<string | null>(null)
  const [variant, setVariant] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Score > 0 = la plantilla comparte vocabulario con lo que el usuario vende.
  const scores = new Map(matchTemplates(productType ?? '').map((r) => [r.template.id, r.score]))

  // La categoría del brief primero; dentro de cada una, las que matchean arriba.
  const orderedCategories = [...CATEGORIES].sort((a, b) =>
    a.id === categoryId ? -1 : b.id === categoryId ? 1 : 0,
  )

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

  const tabBtn = (active: boolean) =>
    `flex-1 h-9 rounded-xl text-[12px] font-semibold transition-all cursor-pointer border ${
      active
        ? 'bg-[rgba(255,156,77,0.12)] border-[rgba(255,156,77,0.4)] text-[#ff9c4d]'
        : 'bg-white/[0.04] border-white/[0.06] text-[#bdbdbd] hover:text-[#f5f5f5]'
    }`

  const pickedDna = picked ? TEMPLATE_DNA[picked] : null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Elige la plantilla que más te guste, o sube una foto de un producto de referencia.
        Tomamos de ella el estilo, la composición y el layout; tu marca y tu copy son lo que cambia.
      </p>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('template')} className={tabBtn(tab === 'template')}>
          Elegir plantilla
        </button>
        <button type="button" onClick={() => setTab('upload')} className={tabBtn(tab === 'upload')}>
          Subir referencia
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {tab === 'template' ? (
        <div className="flex flex-col gap-6">
          {orderedCategories.map((cat) => {
            const items = TEMPLATES
              .filter((t) => t.categoryId === cat.id)
              .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
            return (
              <div key={cat.id} className="flex flex-col gap-2">
                <h4 className="text-[11px] font-bold text-[#8a8a8a] tracking-[1px] uppercase">{cat.name}</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {items.map((t) => {
                    const matches = (scores.get(t.id) ?? 0) > 0
                    const same = isSameProduct(t, productType ?? '')
                    const isPicked = picked === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setPicked(t.id); setVariant(0) }}
                        className={`group relative rounded-xl overflow-hidden border text-left transition-colors cursor-pointer bg-[#141414] ${
                          isPicked
                            ? 'border-[#ff9c4d]'
                            : matches
                              ? 'border-[rgba(255,156,77,0.45)]'
                              : 'border-white/[0.08] hover:border-white/[0.2]'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={templateImageUrl(t.id)} alt={t.productType} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                        <div className="p-2.5">
                          <div className="text-[12px] font-semibold text-[#f5f5f5]">{t.productType}</div>
                          {matches && (
                            <div className="text-[11px] text-[#ff9c4d]">{same ? 'Mismo producto' : 'Adaptado'}</div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/[0.1] rounded-2xl p-10 cursor-pointer hover:border-[rgba(255,156,77,0.5)] transition-colors bg-[#141414]">
          <Upload className="w-7 h-7 text-[#8a8a8a]" />
          <span className="text-[13px] text-[#8a8a8a] text-center">
            {busy ? 'Analizando tu referencia...' : 'Sube una foto del producto en el que quieres basar tu marca'}
          </span>
          <input type="file" accept="image/*" className="hidden" disabled={busy}
                 onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      )}

      {/* Paletas de la plantilla elegida — dato, nunca render. */}
      {pickedDna && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[11px] font-bold text-[#8a8a8a] tracking-[1px] uppercase">Elige tu paleta</p>
          <div className="flex flex-wrap gap-2">
            {pickedDna.palettes.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setVariant(i)}
                className={`flex gap-1 p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  variant === i ? 'border-[#ff9c4d]' : 'border-white/[0.1] hover:border-white/[0.25]'
                }`}
              >
                {p.map((c, j) => (
                  <span key={j} className="w-6 h-6 rounded" style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />
                ))}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onTemplateChosen(picked!, variant)}
            className="h-11 w-full rounded-xl jr-cta text-[13px] font-bold cursor-pointer border-0 font-sans"
          >
            Usar «{getTemplate(picked!).productType}» →
          </button>
        </div>
      )}
    </div>
  )
}
