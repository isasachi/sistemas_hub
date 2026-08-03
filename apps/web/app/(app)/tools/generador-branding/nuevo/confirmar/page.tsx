'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useBrief, btnPrimary } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, resumePath, isComplete } from '@/lib/branding/brief'
import { getPreset } from '@/lib/branding/presets'

const COLOR_LABELS: Record<string, string> = {
  primary: 'Primario', secondary: 'Secundario', accent: 'Acento', dark: 'Oscuro', light: 'Claro',
}

/** Ref del moodboard; mientras los assets no existan, cae a la miniatura del preset. */
function MoodRef({ src, fallback, alt }: { src: string; fallback: string; alt: string }) {
  const [url, setUrl] = useState(src)
  useEffect(() => { setUrl(src) }, [src])
  // eslint-disable-next-line @next/next/no-img-element -- necesita onError para el fallback
  return <img src={url} alt={alt} onError={() => setUrl(fallback)}
              className="w-full aspect-square object-cover rounded-xl border border-white/[0.08]" />
}

export default function ConfirmarPage() {
  const router = useRouter()
  const { brief } = useBrief()

  // Llegar acá sin el brief entero (link directo, localStorage limpiado) manda al
  // primer paso que falte en vez de romper.
  useEffect(() => {
    if (brief && !isComplete(brief)) router.replace(resumePath(brief))
  }, [brief, router])

  if (!brief || !isComplete(brief)) return null
  const preset = getPreset(brief.presetId)

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-6 py-4">
        <Link href={STEPS[3].path} className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/[0.1] text-[13px] font-semibold text-[#f5f5f5] no-underline hover:bg-white/[0.05] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Cambiar estilo
        </Link>
      </div>

      <div className="flex-1 w-full max-w-[880px] mx-auto px-6 pb-10 flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <p className="readout text-[11px] font-bold tracking-[1.5px] uppercase text-[#8a8a8a]">Tu estilo</p>
          <h1 className="text-[28px] font-bold text-[#f5f5f5] leading-tight">{preset.label}</h1>
          <p className="text-[14px] text-[#bdbdbd]">{preset.signature}</p>
        </div>

        {/* Tipografías, con el nombre real del usuario */}
        <div className="grid sm:grid-cols-2 gap-4">
          {(['display', 'body'] as const).map((role) => (
            <div key={role} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex flex-col gap-2">
              <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-[#8a8a8a]">
                {role === 'display' ? 'Títulos' : 'Texto'} · {preset.typography[role]}
              </p>
              <p className="text-[34px] leading-tight text-[#f5f5f5] break-words"
                 style={{ fontFamily: `'${preset.typography[role]}', Georgia, sans-serif` }}>
                {brief.brandName}
              </p>
              <p className="text-[13px] text-[#bdbdbd]" style={{ fontFamily: `'${preset.typography.body}', sans-serif` }}>
                {brief.productDescription}
              </p>
            </div>
          ))}
        </div>

        {/* Paleta */}
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-bold text-[#f5f5f5]">Paleta</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(preset.palette).map(([key, hex]) => (
              <div key={key} className="flex flex-col gap-2">
                <span className="w-full aspect-[3/2] rounded-xl border border-white/[0.1]" style={{ background: hex }} />
                <span className="flex flex-col">
                  <span className="text-[12px] font-semibold text-[#f5f5f5]">{COLOR_LABELS[key]}</span>
                  <span className="readout text-[11px] text-[#8a8a8a]">{hex}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Moodboard (2 refs) */}
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-bold text-[#f5f5f5]">Referencias</p>
          <div className="grid grid-cols-2 gap-3 max-w-[420px]">
            {preset.moodboard.slice(0, 2).map((m, i) => (
              <MoodRef key={m} src={m} fallback={preset.thumbnail} alt={`Referencia ${i + 1} de ${preset.label}`} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => router.push('/tools/generador-branding/nuevo/generando')}
                  className={btnPrimary + ' h-12 px-8'}>
            Crear mi marca
          </button>
          <Link href={STEPS[3].path}
                className="h-12 px-6 rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#f5f5f5] no-underline hover:bg-white/[0.05] transition-colors flex items-center">
            Elegir otro estilo
          </Link>
        </div>
      </div>
    </div>
  )
}
