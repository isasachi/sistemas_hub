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

// Control segmentado de 2 opciones (mismo look que los tabs de Section5).
function Toggle({ value, onChange, yes, no }: { value: boolean; onChange: (v: boolean) => void; yes: string; no: string }) {
  const btn = (active: boolean, label: string, v: boolean) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      className={`flex-1 h-9 rounded-xl text-[12px] font-semibold transition-all cursor-pointer border ${
        active
          ? 'bg-[rgba(255,156,77,0.12)] border-[rgba(255,156,77,0.4)] text-[#ff9c4d]'
          : 'bg-white/[0.04] border-white/[0.06] text-[#bdbdbd] hover:text-[#f5f5f5]'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex gap-2">
      {btn(value, yes, true)}
      {btn(!value, no, false)}
    </div>
  )
}

// Chips clicables de nombres sugeridos por la IA.
function Suggestions({ names, onPick }: { names: string[]; onPick: (n: string) => void }) {
  if (!names.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {names.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          className="px-3 h-8 rounded-lg text-[12px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#f5f5f5] hover:border-[rgba(255,156,77,0.5)] transition-colors cursor-pointer"
        >
          {n}
        </button>
      ))}
    </div>
  )
}

export default function Section1Brief() {
  const { sessionId, setBrief, setDirection } = useBrandingStore()
  const [productCategory, setProductCategory] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [personality, setPersonality] = useState<string[]>([])
  const [briefNotes, setBriefNotes] = useState('')

  const [hasBrand, setHasBrand] = useState(true)
  const [brandName, setBrandName] = useState('')
  const [brandNames, setBrandNames] = useState<string[]>([])

  const [hasProductName, setHasProductName] = useState(true)
  const [productName, setProductName] = useState('')
  const [nameIdea, setNameIdea] = useState('')
  const [productNames, setProductNames] = useState<string[]>([])

  const [suggesting, setSuggesting] = useState<'brand' | 'product' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = brandName.trim() && productName.trim() && productCategory.trim() && !loading

  async function suggest(kind: 'brand' | 'product') {
    if (!sessionId || !productCategory.trim() || suggesting) return
    setSuggesting(kind)
    setError(null)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/suggest-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          category: productCategory,
          audience: targetAudience,
          personality,
          idea: kind === 'product' ? nameIdea : undefined,
          brandName: kind === 'product' ? brandName : undefined,
        }),
      })
      const data = (await res.json()) as { names?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron sugerir nombres')
      if (kind === 'brand') setBrandNames(data.names ?? [])
      else setProductNames(data.names ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSuggesting(null)
    }
  }

  async function handleSubmit() {
    if (!sessionId || !canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/direction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, productName, productCategory, targetAudience, personality, briefNotes }),
      })
      const data = (await res.json()) as { direction?: unknown; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al generar la dirección')
      setBrief({ brandName, productName, productCategory, targetAudience, personality, briefNotes })
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
        type="input" id="productCategory" label="¿Qué producto vendes?" required
        placeholder="Ej: gomitas de fruta, café orgánico, jabones artesanales"
        value={productCategory} onChange={setProductCategory}
      />
      <FieldGroup
        type="input" id="targetAudience" label="¿Para quién es?" helper="(opcional)"
        placeholder="Ej: jóvenes fitness, mamás, oficinistas"
        value={targetAudience} onChange={setTargetAudience}
      />

      {/* Marca: ¿ya tiene una? */}
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-[#f5f5f5]">¿Ya tienes una marca?</label>
        <Toggle value={hasBrand} onChange={setHasBrand} yes="Sí, ya tengo" no="Necesito una" />
        {hasBrand ? (
          <FieldGroup
            type="input" id="brandName" label="Nombre de la marca" required
            placeholder="Ej: Gomitas Andinas"
            value={brandName} onChange={setBrandName}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <FieldGroup
              type="input" id="brandName" label="Nombre de la marca elegido" required
              placeholder="Elige una sugerencia o escríbela"
              value={brandName} onChange={setBrandName}
            />
            <button
              type="button" onClick={() => suggest('brand')} disabled={!productCategory.trim() || suggesting === 'brand'}
              className="h-9 px-3 self-start rounded-xl border border-white/[0.14] text-[#f5f5f5] text-[12px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent disabled:opacity-40 flex items-center gap-2"
            >
              {suggesting === 'brand' ? '✦ Pensando...' : brandNames.length ? '↻ Otras opciones' : '✦ Sugerir nombres de marca'}
            </button>
            <Suggestions names={brandNames} onPick={setBrandName} />
          </div>
        )}
      </div>

      {/* Nombre del producto */}
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-[#f5f5f5]">¿Ya tienes nombre para el producto?</label>
        <Toggle value={hasProductName} onChange={setHasProductName} yes="Sí, ya tengo" no="Ayúdame" />
        {hasProductName ? (
          <FieldGroup
            type="input" id="productName" label="Nombre del producto" required
            placeholder="Ej: Gomi-Mango, Energía Andina"
            value={productName} onChange={setProductName}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <FieldGroup
              type="input" id="nameIdea" label="¿Tienes una idea del tipo de nombre?" helper="(opcional)"
              placeholder="Ej: algo con la fruta, divertido, en quechua..."
              value={nameIdea} onChange={setNameIdea}
            />
            <FieldGroup
              type="input" id="productName" label="Nombre del producto elegido" required
              placeholder="Elige una sugerencia o escríbela"
              value={productName} onChange={setProductName}
            />
            <button
              type="button" onClick={() => suggest('product')} disabled={!productCategory.trim() || suggesting === 'product'}
              className="h-9 px-3 self-start rounded-xl border border-white/[0.14] text-[#f5f5f5] text-[12px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent disabled:opacity-40 flex items-center gap-2"
            >
              {suggesting === 'product' ? '✦ Pensando...' : productNames.length ? '↻ Otras opciones' : '✦ Sugerir nombres'}
            </button>
            <Suggestions names={productNames} onPick={setProductName} />
          </div>
        )}
      </div>

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
