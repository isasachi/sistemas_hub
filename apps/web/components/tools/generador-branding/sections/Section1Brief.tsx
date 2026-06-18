'use client'

import { useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { FieldGroup } from '@/components/tools/ui/FieldGroup'
import { ChipGroup } from '@/components/tools/ui/ChipGroup'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

const PERSONALITY_OPTIONS = [
  'Premium', 'Natural', 'Divertido', 'Minimalista', 'Cálido',
  'Moderno', 'Artesanal', 'Confiable', 'Juvenil', 'Elegante', 'Atrevido',
]

export default function Section1Brief() {
  const { sessionId, setBrief, setDirection } = useBrandingStore()
  const [brandName, setBrandName] = useState('')
  const [productCategory, setProductCategory] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [personality, setPersonality] = useState<string[]>([])
  const [briefNotes, setBriefNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = brandName.trim() && productCategory.trim() && !loading

  async function handleSubmit() {
    if (!sessionId || !canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/direction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, productCategory, targetAudience, personality, briefNotes }),
      })
      const data = (await res.json()) as { direction?: unknown; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al generar la dirección')
      setBrief({ brandName, productCategory, targetAudience, personality, briefNotes })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDirection(data.direction as any)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Cuéntanos lo básico de tu negocio. Con esto definimos el rumbo visual antes de generar nada.
      </p>

      <FieldGroup
        type="input" id="brandName" label="Nombre de la marca" required
        placeholder="Ej: Gomitas Andinas"
        value={brandName} onChange={setBrandName}
      />
      <FieldGroup
        type="input" id="productCategory" label="¿Qué producto vendes?" required
        placeholder="Ej: gomitas de fruta, café orgánico, jabones artesanales"
        value={productCategory} onChange={setProductCategory}
      />
      <FieldGroup
        type="input" id="targetAudience" label="¿Para quién es?" helper="(opcional)"
        placeholder="Ej: jóvenes fitness, mamás, oficinistas"
        value={targetAudience} onChange={setTargetAudience}
      />

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-[#f5f5f5]">
          Personalidad de la marca <span className="text-[#8a8a8a] font-normal ml-1.5">(elige las que apliquen)</span>
        </label>
        <ChipGroup
          options={PERSONALITY_OPTIONS}
          selected={personality}
          multi
          onChange={(v) => setPersonality(v as string[])}
        />
      </div>

      <FieldGroup
        type="textarea" id="briefNotes" label="Algo más que debamos saber" helper="(opcional)"
        placeholder="Colores que te gustan, referencias, lo que quieras transmitir..."
        rows={2}
        value={briefNotes} onChange={setBriefNotes}
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      <button onClick={handleSubmit} disabled={!canSubmit} className={btnPrimary + ' h-11 w-full'}>
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Definiendo dirección...
          </>
        ) : (
          'Crear dirección de marca'
        )}
      </button>
    </div>
  )
}
