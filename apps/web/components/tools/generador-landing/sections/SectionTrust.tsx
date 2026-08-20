'use client'

import { useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { ChipGroup } from '@/components/tools/ui/ChipGroup'
import { PaymentMethod, type TrustBlock } from '@/lib/landing/types'

// Paso "Confianza y pagos" (Fase 5). El usuario carga los HECHOS operativos del negocio — un
// modelo no puede inferirlos y no debe inventarlos. Alimentan las secciones garantía/cta-final
// (logos de pago reales, sello de garantía) y el validador cruzado. $0: no llama LLM.

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'
const btnGhost =
  'h-11 px-4 rounded-xl border border-white/[0.14] text-[#efe7e0] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent'

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  yape: 'Yape', plin: 'Plin', mercadopago: 'Mercado Pago', visa: 'Visa',
  mastercard: 'Mastercard', efectivo: 'Efectivo', transferencia: 'Transferencia',
}
const PAYMENT_OPTIONS = PaymentMethod.options.map((m) => PAYMENT_LABELS[m])
const summary = (t: TrustBlock) => [
  t.codDelivery && 'Contraentrega',
  (t.paymentMethods ?? []).map((m) => PAYMENT_LABELS[m]).slice(0, 3).join('/'),
  t.deliveryTime,
  t.freeShipping && 'Envío gratis',
  t.guaranteeDays ? `Garantía ${t.guaranteeDays}d` : null,
].filter(Boolean).join(' · ')
const LABEL_TO_METHOD = Object.fromEntries(PaymentMethod.options.map((m) => [PAYMENT_LABELS[m], m])) as Record<string, PaymentMethod>
const COVERAGE_OPTIONS = ['Perú', 'EE.UU.', 'LATAM', 'España']

// Default con sabor peruano (el ADN CLEARSTEM): contraentrega, envío rápido, medios locales.
const DEFAULT: TrustBlock = {
  codDelivery: true, deliveryTime: '24/48 horas', coverage: ['Perú'],
  paymentMethods: ['yape', 'visa', 'mastercard', 'mercadopago'], guaranteeDays: 30,
  guaranteeText: 'Devolución garantizada', freeShipping: true,
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between w-full rounded-xl border px-4 py-3 text-[13px] transition-colors cursor-pointer ${checked ? 'border-[#e8467a]/40 bg-[#e8467a]/10 text-[#efe7e0]' : 'border-white/[0.12] bg-transparent text-[#c9b4ae] hover:bg-white/[0.04]'}`}
    >
      <span>{label}</span>
      <span className={`w-4 h-4 rounded-md border flex items-center justify-center ${checked ? 'bg-[#e8467a] border-[#e8467a] text-black' : 'border-white/30'}`}>{checked ? '✓' : ''}</span>
    </button>
  )
}

export default function SectionTrust() {
  const { sessionId, trustBlock, setTrustBlock, confirmTrust } = useLandingStore()
  const init = trustBlock ?? DEFAULT
  // Arranca en modo resumen SIEMPRE (incluso sin trustBlock aún, mostrando el DEFAULT) — el
  // objetivo es que el usuario confirme con 1 click en vez de llenar 7 campos.
  const [editing, setEditing] = useState(false)
  const [codDelivery, setCod] = useState(init.codDelivery)
  const [freeShipping, setFree] = useState(init.freeShipping)
  const [deliveryTime, setDelivery] = useState(init.deliveryTime ?? '')
  const [coverage, setCoverage] = useState<string[]>(init.coverage ?? [])
  const [payments, setPayments] = useState<string[]>((init.paymentMethods ?? []).map((m) => PAYMENT_LABELS[m]))
  const [guaranteeDays, setDays] = useState(String(init.guaranteeDays ?? 0))
  const [guaranteeText, setGtext] = useState(init.guaranteeText ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const methods = payments.map((l) => LABEL_TO_METHOD[l]).filter(Boolean)

  async function save() {
    if (!sessionId || loading) return
    if (methods.length === 0) { setError('Elige al menos un medio de pago.'); return }
    setLoading(true)
    setError(null)
    const days = Math.max(0, Math.min(365, parseInt(guaranteeDays, 10) || 0))
    const trust: TrustBlock = {
      codDelivery,
      freeShipping,
      deliveryTime: deliveryTime.trim() || undefined,
      coverage: coverage.length ? coverage.slice(0, 4) : undefined,
      paymentMethods: methods,
      guaranteeDays: days || undefined,
      guaranteeText: days ? (guaranteeText.trim() || undefined) : undefined,
    }
    try {
      const res = await fetch(`/api/generador-landing/sessions/${sessionId}/trust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trust }),
      })
      const data = (await res.json()) as { trustBlock?: TrustBlock; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setTrustBlock(data.trustBlock ?? trust)
      confirmTrust()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!sessionId) return null

  if (!editing) {
    const t = trustBlock ?? DEFAULT
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[#c9b4ae]">Estos datos son tuyos, no los inventa la IA. Estos son los valores habituales para negocios en Perú — edítalos si el tuyo es distinto.</p>
        <div className="rounded-xl border border-white/[0.08] bg-[#2a0f1a] px-4 py-3 text-[13px] text-[#c9b4ae]">{summary(t)}</div>
        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className={btnGhost}>Editar</button>
          <button type="button" onClick={save} disabled={loading} className={btnPrimary + ' flex-1'}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</> : 'Confirmar y continuar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#c9b4ae]">Estos datos son tuyos, no los inventa la IA. Aparecen en las secciones de garantía y cierre (logos de pago reales, sello de garantía) y mantienen coherente toda la landing.</p>

      <div className="flex flex-col gap-2">
        <Toggle label="Pago contraentrega (pagas al recibir)" checked={codDelivery} onChange={setCod} />
        <Toggle label="Envío gratis" checked={freeShipping} onChange={setFree} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[#a98c88]">Plazo de entrega</span>
        <input value={deliveryTime} onChange={(e) => setDelivery(e.target.value)} placeholder="24/48 horas" className="jr-field rounded-xl px-3 py-2 text-[13px]" />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[#a98c88]">Cobertura</span>
        <ChipGroup options={COVERAGE_OPTIONS} selected={coverage} multi onChange={(v) => setCoverage(v as string[])} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[#a98c88]">Medios de pago</span>
        <ChipGroup options={PAYMENT_OPTIONS} selected={payments} multi onChange={(v) => setPayments(v as string[])} />
      </div>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1.5 w-28">
          <span className="text-[12px] text-[#a98c88]">Garantía (días)</span>
          <input value={guaranteeDays} onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="30" className="jr-field rounded-xl px-3 py-2 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1.5 flex-1">
          <span className="text-[12px] text-[#a98c88]">Texto de garantía (opcional)</span>
          <input value={guaranteeText} onChange={(e) => setGtext(e.target.value)} placeholder="Devolución garantizada" disabled={!parseInt(guaranteeDays, 10)} className="jr-field rounded-xl px-3 py-2 text-[13px] disabled:opacity-40" />
        </label>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      <button onClick={save} disabled={loading} className={btnPrimary}>
        {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</> : 'Confirmar confianza y pagos'}
      </button>
    </div>
  )
}
