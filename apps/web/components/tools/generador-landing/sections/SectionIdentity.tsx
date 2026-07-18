'use client'

import { useEffect, useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { TYPE_PAIRS, TypePairId } from '@/lib/landing/typography-catalog'
import { NicheCode, type DerivedBrand, type CastingSpec } from '@/lib/landing/types'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'
const btnGhost =
  'h-10 px-4 rounded-xl border border-white/[0.14] text-[#f5f5f5] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent'
const field = 'jr-field rounded-xl px-3 py-2 text-[13px] w-full'
const lbl = 'text-[11px] uppercase tracking-wide text-[#8a8a8a]'

const NICHE_LABELS: Record<string, string> = {
  'salud-clinico': 'Salud / clínico',
  'fitness-energia': 'Fitness / energía',
  'belleza-premium': 'Belleza / premium',
  'hogar-calido': 'Hogar / cálido',
  'tech-limpio': 'Tech / limpio',
  'bebe-pastel': 'Bebé / pastel',
}
const AGE_RANGES: CastingSpec['ageRange'][] = ['18-25', '25-35', '35-50', '50-65', '65+']
const GENDERS: CastingSpec['gender'][] = ['femenino', 'masculino', 'mixto']

// Preview real del headline: todas las display del catálogo son Google Fonts. Se cargan solo
// en este paso (client), no en la generación — ahí las fuentes las bundlea Satori vía fonts.ts.
const GF_NO_WEIGHT = new Set(['Archivo Black'])
const GF_URL = `https://fonts.googleapis.com/css2?${[...new Set(Object.values(TYPE_PAIRS).map((p) => p.display))]
  .map((f) => `family=${f.replace(/ /g, '+')}${GF_NO_WEIGHT.has(f) ? '' : ':wght@700'}`)
  .join('&')}&display=swap`

export default function SectionIdentity() {
  const { sessionId, step, derivedBrand, setDerivedBrand, talentUrl, setTalentUrl, confirmIdentity, productName } = useLandingStore()
  const [local, setLocal] = useState<DerivedBrand | null>(derivedBrand)
  const [deriving, setDeriving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [genTalent, setGenTalent] = useState(false)
  const [talentError, setTalentError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Deriva al entrar al paso (idempotente en el server). Solo cuando está activo y sin marca.
  useEffect(() => {
    if (step !== 2 || !sessionId || derivedBrand || deriving) return
    setDeriving(true)
    setError(null)
    fetch(`/api/generador-landing/sessions/${sessionId}/brand`, { method: 'POST' })
      .then(async (r) => {
        const data = (await r.json()) as { derivedBrand?: DerivedBrand; error?: string }
        if (!r.ok) throw new Error(data.error ?? 'No se pudo derivar la identidad')
        if (data.derivedBrand) { setDerivedBrand(data.derivedBrand); setLocal(data.derivedBrand) }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setDeriving(false))
  }, [step, sessionId, derivedBrand, deriving, setDerivedBrand])

  // Sembrar el editable cuando la marca llega desde el store (hidratación / handoff).
  useEffect(() => { if (derivedBrand && !local) setLocal(derivedBrand) }, [derivedBrand, local])

  // Genera/regenera la placa de talento desde el casting ACTUAL (local). La llama el efecto
  // (auto, cuando hay persona y aún no hay placa) y el botón "Generar otra persona".
  async function generateTalentNow() {
    if (!sessionId || !local || genTalent) return
    setGenTalent(true)
    setTalentError(null)
    try {
      const res = await fetch(`/api/generador-landing/sessions/${sessionId}/talent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: local }),
      })
      const data = (await res.json()) as { talentUrl?: string | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo generar el talento')
      setTalentUrl(data.talentUrl ?? null)
    } catch (e) {
      setTalentError((e as Error).message)
    } finally {
      setGenTalent(false)
    }
  }

  // Auto-genera el talento la primera vez: paso activo, hay persona y aún no hay placa.
  useEffect(() => {
    if (step === 2 && local?.casting.present && !talentUrl && !genTalent) generateTalentNow()
  }, [step, local?.casting.present, talentUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  function patch(p: Partial<DerivedBrand>) { setLocal((b) => (b ? { ...b, ...p } : b)) }
  function patchCasting(p: Partial<CastingSpec>) { setLocal((b) => (b ? { ...b, casting: { ...b.casting, ...p } } : b)) }
  function patchColor(i: number, key: 'hex' | 'name', v: string) {
    setLocal((b) => (b ? { ...b, palette: b.palette.map((c, j) => (j === i ? { ...c, [key]: v } : c)) as DerivedBrand['palette'] } : b))
  }

  async function confirm() {
    if (!sessionId || !local || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-landing/sessions/${sessionId}/brand`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: local }),
      })
      const data = (await res.json()) as { derivedBrand?: DerivedBrand; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar la identidad')
      if (data.derivedBrand) setDerivedBrand(data.derivedBrand)
      confirmIdentity()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!sessionId) return null

  if (deriving && !local) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-[#bdbdbd]">
        <span className="w-6 h-6 border-2 border-white/20 border-t-[#ff9c4d] rounded-full animate-spin" />
        <p className="text-[13px]">Derivando la identidad visual de tu producto…</p>
      </div>
    )
  }

  if (!local) {
    return (
      <div className="flex flex-col gap-3 py-4">
        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}
        <button
          onClick={() => { setDeriving(false); setDerivedBrand(null) }}
          className={btnGhost}
        >↻ Reintentar</button>
      </div>
    )
  }

  const pair = TYPE_PAIRS[local.typePair]

  return (
    <div className="flex flex-col gap-5">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={GF_URL} />
      <p className="text-[13px] text-[#bdbdbd]">
        Revisá la identidad visual que derivamos de tu producto. Ajustá lo que quieras <strong className="text-[#f5f5f5]">antes</strong> de generar cualquier imagen — así no gastás generaciones para descubrir que la persona o el color salieron mal.
      </p>

      {/* Nicho */}
      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Nicho</span>
        <select value={local.niche} onChange={(e) => patch({ niche: NicheCode.parse(e.target.value) })} className={field}>
          {NicheCode.options.map((n) => <option key={n} value={n}>{NICHE_LABELS[n]}</option>)}
        </select>
      </div>

      {/* Paleta */}
      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Paleta</span>
        <div className="flex flex-col gap-2">
          {local.palette.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#000000'}
                onChange={(e) => patchColor(i, 'hex', e.target.value)}
                className="w-9 h-9 rounded-lg border border-white/[0.14] bg-transparent cursor-pointer shrink-0"
                aria-label={`Color ${i + 1}`}
              />
              <input value={c.hex} onChange={(e) => patchColor(i, 'hex', e.target.value)} className={field + ' font-mono w-28 shrink-0'} />
              <input value={c.name} onChange={(e) => patchColor(i, 'name', e.target.value)} className={field} placeholder="Nombre / rol" />
            </div>
          ))}
        </div>
      </div>

      {/* Tipografía — preview real del headline + selector */}
      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Tipografía</span>
        <div className="rounded-xl border border-white/[0.08] bg-[#141414] px-4 py-4">
          <p className="text-[26px] leading-tight text-[#f5f5f5]" style={{ fontFamily: `'${pair.display}', sans-serif`, fontWeight: 700 }}>
            {productName || 'Tu producto'} <span className="text-[#ff9c4d]">ahora</span>
          </p>
          <p className="text-[11px] text-[#8a8a8a] mt-2">{pair.display} · {pair.niche}</p>
        </div>
        <select value={local.typePair} onChange={(e) => patch({ typePair: TypePairId.parse(e.target.value) })} className={field}>
          {TypePairId.options.map((id) => <option key={id} value={id}>{TYPE_PAIRS[id].display} — {TYPE_PAIRS[id].niche}</option>)}
        </select>
      </div>

      {/* Casting */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={lbl}>Talento / casting</span>
          <button
            onClick={() => patchCasting({ present: !local.casting.present })}
            className={`h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors cursor-pointer ${local.casting.present ? 'border-[#ff9c4d]/40 bg-[#ff9c4d]/10 text-[#ff9c4d]' : 'border-white/[0.14] text-[#8a8a8a] bg-transparent'}`}
          >{local.casting.present ? 'Con persona' : 'Sin persona'}</button>
        </div>
        {local.casting.present ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <select value={local.casting.ageRange ?? ''} onChange={(e) => patchCasting({ ageRange: (e.target.value || undefined) as CastingSpec['ageRange'] })} className={field}>
                <option value="">Edad…</option>
                {AGE_RANGES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={local.casting.gender ?? ''} onChange={(e) => patchCasting({ gender: (e.target.value || undefined) as CastingSpec['gender'] })} className={field}>
                <option value="">Género…</option>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <input value={local.casting.appearance ?? ''} onChange={(e) => patchCasting({ appearance: e.target.value || undefined })} className={field} placeholder="Apariencia (rasgos latinoamericanos, piel real…)" />
            <div className="flex gap-2">
              <input value={local.casting.context ?? ''} onChange={(e) => patchCasting({ context: e.target.value || undefined })} className={field} placeholder="Contexto (baño, cocina…)" />
              <input value={local.casting.wardrobe ?? ''} onChange={(e) => patchCasting({ wardrobe: e.target.value || undefined })} className={field} placeholder="Vestuario" />
            </div>
            <input value={local.casting.expression ?? ''} onChange={(e) => patchCasting({ expression: e.target.value || undefined })} className={field} placeholder="Expresión (serena y segura, enérgica…)" />

            {/* Placa de talento: la MISMA persona en las 8 secciones. Lo más importante de acertar. */}
            <div className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-[#141414] p-3">
              <div className="w-24 h-32 rounded-lg overflow-hidden bg-[#0f0f0f] border border-white/[0.06] shrink-0 flex items-center justify-center">
                {genTalent ? (
                  <span className="w-5 h-5 border-2 border-white/20 border-t-[#ff9c4d] rounded-full animate-spin" />
                ) : talentUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={talentUrl} alt="Talento de la campaña" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-[#8a8a8a] text-center px-1">Sin retrato</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <p className="text-[12px] text-[#bdbdbd]">Esta persona aparecerá en <strong className="text-[#f5f5f5]">todas</strong> las secciones. Es la decisión que más se nota — genera otra si no te convence.</p>
                {talentError && <p className="text-[11px] text-red-400">{talentError}</p>}
                <button onClick={generateTalentNow} disabled={genTalent} className={btnGhost + ' self-start'}>
                  {genTalent ? 'Generando…' : talentUrl ? '↻ Generar otra persona' : 'Generar talento'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-[#8a8a8a]">El producto sale solo, sin ninguna persona en escena.</p>
        )}
      </div>

      {/* Mood de escena */}
      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Ambiente de escena</span>
        <textarea value={local.sceneMood} onChange={(e) => patch({ sceneMood: e.target.value })} rows={2} maxLength={160} className={field} />
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      <button onClick={confirm} disabled={saving} className={btnPrimary}>
        {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando…</> : 'Confirmar identidad visual'}
      </button>
    </div>
  )
}
