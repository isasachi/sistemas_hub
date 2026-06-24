'use client'

import { useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { TEMPLATES } from '@/lib/landing/templates'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'

export default function SectionTemplate() {
  const { sessionId, template, setTemplate } = useLandingStore()
  const [picked, setPicked] = useState<string | null>(template)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!sessionId || saving || !picked) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-landing/sessions/${sessionId}/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: picked }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar la plantilla')
      setTemplate(picked)
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
        Elige el estilo visual de tu landing. Las imágenes de ejemplo son referencias generadas — tu producto y copy se aplicarán a este estilo.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {TEMPLATES.map((t) => {
          const active = picked === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPicked(t.id)}
              className={`relative rounded-2xl overflow-hidden border transition-all cursor-pointer text-left ${
                active
                  ? 'border-[rgba(255,156,77,0.8)] shadow-[0_0_0_2px_rgba(255,156,77,0.3)]'
                  : 'border-white/[0.08] hover:border-[rgba(255,156,77,0.5)]'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.thumb} alt={t.label} className="w-full aspect-[9/16] object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2.5 py-2">
                <p className="text-[12px] font-semibold text-white">{t.label}</p>
              </div>
              {active && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#ff9c4d] flex items-center justify-center text-black text-[13px] font-bold">✓</div>
              )}
            </button>
          )
        })}
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      <button onClick={confirm} disabled={saving || !picked} className={btnPrimary}>
        {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</> : 'Continuar'}
      </button>
    </div>
  )
}
