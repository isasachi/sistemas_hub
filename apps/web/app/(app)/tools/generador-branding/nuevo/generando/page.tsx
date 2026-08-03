'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useBrief } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { CONFIRM_PATH, isComplete, resumePath } from '@/lib/branding/brief'
import { getPreset } from '@/lib/branding/presets'

// Las 5 etapas reales del pipeline (spec 7.3). El motor todavía no está conectado
// — falta la key de Recraft para la rama vectorial — así que esta pantalla las
// muestra pendientes en vez de fingir progreso.
const STAGES = [
  'Logo en vector',
  'Mockup del producto',
  'Etiqueta',
  'Variantes en negro y blanco',
  'Brandboard',
]

export default function GenerandoPage() {
  const router = useRouter()
  const { brief } = useBrief()

  // Sin brief entero no hay nada que generar: al primer paso que falte.
  useEffect(() => {
    if (brief && !isComplete(brief)) router.replace(resumePath(brief))
  }, [brief, router])

  if (!brief || !isComplete(brief)) return null
  const preset = getPreset(brief.presetId)

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-6 py-4">
        <Link href={CONFIRM_PATH} className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/[0.1] text-[13px] font-semibold text-[#f5f5f5] no-underline hover:bg-white/[0.05] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Atrás
        </Link>
      </div>

      <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pb-10 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] font-bold text-[#f5f5f5] leading-tight">
            Creando la marca de {brief.brandName}
          </h1>
          <p className="text-[13px] text-[#bdbdbd]">Estilo {preset.label}.</p>
        </div>

        <div className="flex flex-col gap-2">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
              <span className="w-[22px] h-[22px] rounded-full border border-white/[0.12] bg-white/[0.03] flex items-center justify-center readout text-[11px] font-bold text-[#8a8a8a]">
                {i + 1}
              </span>
              <span className="text-[13px] text-[#bdbdbd] flex-1">{s}</span>
              <span className="text-[11px] text-[#8a8a8a]">pendiente</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[rgba(255,156,77,0.25)] bg-[rgba(255,156,77,0.06)] px-4 py-3 text-[12px] text-[#ffca9c]">
          El motor de generación todavía no está conectado: falta la API key de Recraft para el logo
          vectorial. El brief queda guardado.
        </div>
      </div>
    </div>
  )
}
