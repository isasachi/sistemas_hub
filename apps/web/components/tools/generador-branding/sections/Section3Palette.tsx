'use client'

import { useEffect, useState } from 'react'
import { STYLE_PRESETS } from '@/lib/branding/style-presets'
import type { PaletteColor, Typography } from '@/lib/branding/style-presets'

type Template = { label: string; palette: PaletteColor[]; typography: Typography }

// Paso 3: paleta/tipografía. Muestra "Original del estilo" (preset o lo extraído
// en modo upload) + 3 variaciones sugeridas por el LLM, todas fieles al mismo estilo.
export default function Section3Palette({
  sessionId,
  styleId,
  extracted,
  onChosen,
}: {
  sessionId: string
  styleId: string
  extracted: { palette: PaletteColor[]; typography: Typography } | null
  onChosen: (sel: { selectedPalette: PaletteColor[] | null; selectedTypography: Typography | null }) => void
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const original = extracted ?? { palette: STYLE_PRESETS[styleId].palette, typography: STYLE_PRESETS[styleId].typography }

  useEffect(() => {
    fetch(`/api/generador-branding/sessions/${sessionId}/templates`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => { setTemplates([]); setError('No se pudieron generar variaciones') })
  }, [sessionId])

  function Card({ label, palette, typography, isDefault }: { label: string; palette: PaletteColor[]; typography: Typography; isDefault?: boolean }) {
    return (
      <button
        type="button"
        onClick={() => onChosen(isDefault ? { selectedPalette: null, selectedTypography: null } : { selectedPalette: palette, selectedTypography: typography })}
        className="rounded-xl border border-white/[0.08] hover:border-[rgba(255,156,77,0.5)] p-3 text-left transition-colors cursor-pointer bg-[#141414]"
      >
        <div className="flex gap-1 mb-2">
          {palette.map((c) => (
            <span key={c.hex} className="w-7 h-7 rounded-md border border-white/[0.1]" style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />
          ))}
        </div>
        <div className="text-[12px] font-semibold text-[#f5f5f5]">{label}</div>
        <div className="text-[11px] text-[#8a8a8a]">{typography.primary}</div>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Elige la paleta y tipografía para tu marca — todas fieles al estilo que ya elegiste.
      </p>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card label="Original del estilo" palette={original.palette} typography={original.typography} isDefault />
        {templates === null ? (
          <div className="col-span-2 flex items-center gap-2 text-[12px] text-[#8a8a8a] py-4">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generando sugerencias...
          </div>
        ) : (
          templates.map((t) => <Card key={t.label} label={t.label} palette={t.palette} typography={t.typography} />)
        )}
      </div>
    </div>
  )
}
