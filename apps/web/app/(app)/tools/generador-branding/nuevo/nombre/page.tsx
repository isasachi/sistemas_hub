'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import BriefShell, { useBrief } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, brandNameError, BRAND_NAME_MAX } from '@/lib/branding/brief'

// Generador de nombres = v2. El enlace existe detrás de este flag apagado; no hay
// panel ni endpoint todavía (no dejar código muerto: cuando se implemente, acá va).
const NAME_GENERATOR_ENABLED = false

export default function NombrePage() {
  const router = useRouter()
  const { brief, update } = useBrief()
  const [touched, setTouched] = useState(false)

  // Write-through, como el resto del brief: cada tecla se guarda.
  const brandName = brief?.brandName ?? ''

  const error = touched ? brandNameError(brandName) : null
  const ready = !brandNameError(brandName)

  function next() {
    if (!ready) return
    update({ brandName: brandName.trim() })
    router.push(STEPS[2].path)
  }

  if (!brief) return null

  return (
    <BriefShell
      step={2}
      title="¿Cómo se llama?"
      hint="El nombre va a ser el logo. Puedes cambiarlo después."
      onNext={next}
      nextDisabled={!ready}
    >
      <div className="flex flex-col gap-2">
        <Input
          id="brandName"
          placeholder="Ej: Kelvin"
          maxLength={BRAND_NAME_MAX}
          value={brandName}
          onChange={(e) => update({ brandName: e.target.value })}
          onBlur={() => { setTouched(true); update({ brandName: brandName.trim() }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') next() }}
          className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-[14px] text-[#ededed]"
        />
        <div className="flex items-center justify-between">
          {error ? <p className="text-[12px] text-red-400">{error}</p> : <span />}
          <span className="text-[11px] text-[#bebebe]">{brandName.trim().length}/{BRAND_NAME_MAX}</span>
        </div>
        {NAME_GENERATOR_ENABLED && (
          <button type="button" className="self-start text-[12px] text-[#ff9b4a] bg-transparent border-0 cursor-pointer">
            generar opciones
          </button>
        )}
      </div>

      {/* Eslogan: opcional a propósito. Vacío = lo inventa el modelo, como en el
          board de referencia ("FUEL YOUR EDGE" no salió de ninguna casilla). */}
      <div className="flex flex-col gap-2">
        <label htmlFor="tagline" className="text-[13px] text-[#cfcfcf]">
          Eslogan <span className="text-[#bebebe]">— opcional. Si lo dejas vacío, lo proponemos nosotros.</span>
        </label>
        <Input
          id="tagline"
          placeholder="Ej: Fuerza que se nota"
          maxLength={40}
          value={brief.tagline ?? ''}
          onChange={(e) => update({ tagline: e.target.value || undefined })}
          onBlur={() => update({ tagline: brief.tagline?.trim() || undefined })}
          className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-[14px] text-[#ededed]"
        />
      </div>
    </BriefShell>
  )
}
