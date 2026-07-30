'use client'

import { useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { FieldGroup } from '@/components/tools/ui/FieldGroup'
import { CATEGORIES } from '@/lib/branding/templates'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

// Control segmentado de 2 opciones (mismo look que los tabs de otras secciones).
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

export default function Section1Brief({ maxStep }: { maxStep: number }) {
  const s = useBrandingStore()
  const { sessionId, setBrief, setCategory } = s
  // Sembrado desde el store: AccordionSection remonta el paso al reabrirlo, así
  // que sin esto el brief ya guardado vuelve en blanco — y como `categoryId` es
  // obligatorio, el botón queda deshabilitado sobre datos que sí existen (mismo
  // bug que task-11 arregló en Section2Template, ver template-selection.ts).
  const [categoryId, setCategoryId] = useState(() => s.categoryId ?? '')
  const [productType, setProductType] = useState(() => s.productType ?? '')
  const [descriptor, setDescriptor] = useState(() => s.descriptor ?? '')
  const [tagline, setTagline] = useState(() => s.tagline ?? '')
  const [containerType, setContainerType] = useState(() => s.containerType ?? '')

  const [hasBrand, setHasBrand] = useState(true)
  const [brandName, setBrandName] = useState(() => s.brandName ?? '')
  const [brandNames, setBrandNames] = useState<string[]>([])

  const [hasProductName, setHasProductName] = useState(true)
  const [productName, setProductName] = useState(() => s.productName ?? '')
  const [productNames, setProductNames] = useState<string[]>([])

  const [suggesting, setSuggesting] = useState<'brand' | 'product' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = categoryId && brandName.trim() && productName.trim() && productType.trim() && !loading

  async function suggest(kind: 'brand' | 'product') {
    if (!sessionId || !productType.trim() || suggesting) return
    setSuggesting(kind)
    setError(null)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/suggest-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          category: productType,
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
      const data = {
        product_category: categoryId,
        brand_name: brandName.trim(),
        product_name: productName.trim(),
        product_type: productType.trim(),
        descriptor: descriptor.trim(),
        tagline: tagline.trim(),
        container_type: containerType.trim(),
      }
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // El step persistido nunca regresa (high-water mark) — ver nota en BrandingWizard.
        body: JSON.stringify({ ...data, step: Math.max(maxStep, 1) }),
      })
      const resData = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(resData.error ?? 'Error al guardar el brief')
      setCategory(categoryId)
      setBrief({
        categoryId,
        brandName: data.brand_name,
        productName: data.product_name,
        productType: data.product_type,
        descriptor: data.descriptor,
        tagline: data.tagline,
        containerType: data.container_type,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Cuéntanos lo básico de tu marca y tu producto. Con esto generamos el logo, la etiqueta y el mockup.
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="categoryId" className="text-[13px] font-semibold text-[#f5f5f5]">
          Categoría <span className="text-[#ff9c4d]">*</span>
        </label>
        <select
          id="categoryId"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 text-[13px] text-[#f5f5f5] cursor-pointer"
        >
          <option value="">Elige una categoría</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#141414]">{c.name}</option>
          ))}
        </select>
      </div>

      <FieldGroup
        type="input" id="productType" label="¿Qué producto vendes?" required
        placeholder="Ej: sérum facial, café en grano, gomitas de fruta"
        value={productType} onChange={setProductType}
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
              type="button" onClick={() => suggest('brand')} disabled={!productType.trim() || suggesting === 'brand'}
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
              type="input" id="productName" label="Nombre del producto elegido" required
              placeholder="Elige una sugerencia o escríbela"
              value={productName} onChange={setProductName}
            />
            <button
              type="button" onClick={() => suggest('product')} disabled={!productType.trim() || suggesting === 'product'}
              className="h-9 px-3 self-start rounded-xl border border-white/[0.14] text-[#f5f5f5] text-[12px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent disabled:opacity-40 flex items-center gap-2"
            >
              {suggesting === 'product' ? '✦ Pensando...' : productNames.length ? '↻ Otras opciones' : '✦ Sugerir nombres'}
            </button>
            <Suggestions names={productNames} onPick={setProductName} />
          </div>
        )}
      </div>

      <FieldGroup
        type="input" id="descriptor" label="Posicionamiento / claim corto" helper="(opcional)"
        placeholder="Ej: hidratación 24h, tueste artesanal"
        value={descriptor} onChange={setDescriptor}
      />
      <FieldGroup
        type="input" id="tagline" label="Tagline" helper="(opcional)"
        placeholder="Ej: Despierta renovada"
        value={tagline} onChange={setTagline}
      />
      <FieldGroup
        type="input" id="containerType" label="Tipo de envase" helper="(opcional)"
        placeholder="Ej: frasco con gotero, doypack, caja, tubo"
        value={containerType} onChange={setContainerType}
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      <button onClick={handleSubmit} disabled={!canSubmit} className={btnPrimary + ' h-11 w-full'}>
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Guardando...
          </>
        ) : (
          'Continuar →'
        )}
      </button>
    </div>
  )
}
