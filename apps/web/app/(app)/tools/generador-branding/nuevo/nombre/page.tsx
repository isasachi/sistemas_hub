'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import BriefShell, { useBrief } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, brandNameError, BRAND_NAME_MAX } from '@/lib/branding/brief'

export default function NombrePage() {
  const router = useRouter()
  const { brief, update } = useBrief()
  const [touched, setTouched] = useState(false)
  const [ideas, setIdeas] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  // Write-through, como el resto del brief: cada tecla se guarda.
  const brandName = brief?.brandName ?? ''

  const error = touched ? brandNameError(brandName) : null
  const ready = !brandNameError(brandName)

  // Solo con clic: el input escrito es el camino principal y auto-proponer cobraría
  // una llamada al LLM cada vez que alguien pasa (o vuelve) por este paso.
  async function suggest() {
    if (!brief || loading) return
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch('/api/generador-branding/nombre-sugerido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: brief.category, productDescription: brief.productDescription,
          audience: brief.audience ?? [], feel: brief.feel ?? [],
        }),
      })
      const data = (await res.json()) as { names?: string[] }
      setIdeas(data.names ?? [])
      setFailed(!data.names?.length)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

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
        <button
          type="button"
          onClick={suggest}
          disabled={loading}
          className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#ff9b4a] bg-transparent border-0 cursor-pointer disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {ideas.length ? 'Otras opciones' : 'Generar opciones'}
        </button>

        {failed && (
          <p className="text-[12px] text-[#bebebe]">No salieron propuestas. Intenta otra vez o escribe el nombre.</p>
        )}

        {ideas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ideas.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => { update({ brandName: n }); setTouched(true) }}
                className={`h-9 px-3 rounded-full border text-[13px] cursor-pointer transition-colors ${
                  brandName.trim() === n
                    ? 'border-[#ff9b4a] text-[#ff9b4a] bg-[#ff9b4a]/[0.08]'
                    : 'border-white/[0.1] text-[#cfcfcf] bg-white/[0.03] hover:text-[#ededed]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
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
