'use client'

import { useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { FieldGroup } from '@/components/tools/ui/FieldGroup'
import { ChipGroup } from '@/components/tools/ui/ChipGroup'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'

const TONE_OPTIONS = ['Profesional', 'Cercano', 'Divertido', 'Lujoso', 'Urgente', 'Confiable']

export default function Section1Product() {
  const { sessionId, productName, price, benefits, audience, tone, productForm, setDetails } = useLandingStore()
  const [name, setName] = useState(productName ?? '')
  const [priceV, setPriceV] = useState(price ?? '')
  const [benefitsV, setBenefitsV] = useState(benefits ?? '')
  const [audienceV, setAudienceV] = useState(audience ?? '')
  const [toneV, setToneV] = useState<string[]>(tone)
  const [formV, setFormV] = useState(productForm ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!sessionId || saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-landing/sessions/${sessionId}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: name, price: priceV, benefits: benefitsV, audience: audienceV, tone: toneV, productForm: formV }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setDetails({ productName: name, price: priceV, benefits: benefitsV, audience: audienceV, tone: toneV, productForm: formV })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup type="input" id="ld-name" label="Nombre del producto" required value={name} onChange={setName}
        placeholder="Ej: Serum facial de vitamina C" />

      {/* El precio vivía dentro del acordeón "Afinar copy" y por eso llegaba VACÍO en casi todas las
          sesiones (medido: `price=""` en 23 de 25). Sin precio, la sección de oferta lo inventa —
          y siempre el mismo. Es el input que gobierna esa sección: va a la vista. */}
      <FieldGroup type="input" id="ld-price" label="Precio de venta" helper="(opcional, pero la sección Oferta lo inventa si lo dejas vacío)"
        value={priceV} onChange={setPriceV} placeholder="Ej: S/ 89" />

      {/* QUÉ ES el producto. El pipeline conocía su nombre y el texto de su etiqueta, pero nunca su
          formato: la visión lo deducía de la foto y se equivocaba. Medido con unas gomitas de
          melatonina — la sección de beneficios salió con la persona sirviendo POLVO en un vaso y un
          frasco inventado de "vitamina C en polvo" al lado. El helper nombra la consecuencia de
          dejarlo vacío, mismo criterio que el del precio. */}
      <FieldGroup type="input" id="ld-form" label="¿Qué es el producto?"
        helper="(opcional, pero si lo dejas vacío se deduce de la foto y puede equivocarse de formato)"
        value={formV} onChange={setFormV}
        placeholder="Ej: gomitas masticables · cápsulas · crema · polvo para disolver" />

      <details className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
        <summary className="text-[13px] font-semibold text-[#efe7e0] cursor-pointer select-none">
          Afinar copy <span className="text-[#a98c88] font-normal">(opcional)</span>
        </summary>
        <div className="flex flex-col gap-4 pt-4">
          <FieldGroup type="textarea" id="ld-benefits" label="Beneficios clave" helper="(opcional)" value={benefitsV} onChange={setBenefitsV}
            rows={3} placeholder="Ej: Reduce manchas, hidrata, resultados en 2 semanas" />
          <FieldGroup type="input" id="ld-audience" label="Público objetivo" helper="(opcional)" value={audienceV} onChange={setAudienceV}
            placeholder="Ej: Mujeres 25-45 con piel sensible" />
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold text-[#efe7e0]">Tono <span className="text-[#a98c88] font-normal ml-1.5">(opcional)</span></label>
            <ChipGroup options={TONE_OPTIONS} selected={toneV} multi onChange={(v) => setToneV(v as string[])} />
          </div>
        </div>
      </details>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      <button onClick={submit} disabled={saving || !name.trim()} className={btnPrimary}>
        {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</> : 'Continuar'}
      </button>
    </div>
  )
}
