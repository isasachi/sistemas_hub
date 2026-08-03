'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useBrief, btnPrimary } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, clearBrief, isResumable, resumePath, firstIncompleteStep } from '@/lib/branding/brief'
import { PRESETS } from '@/lib/branding/presets'

// 6.0 — propuesta de valor, un ejemplo visual real (miniaturas de presets) y un CTA.
// Sin registro: el gate de auth del hub vive en proxy.ts, antes de esta pantalla.
export default function GeneradorBrandingEntrada() {
  const router = useRouter()
  const { brief } = useBrief()
  const resumable = brief ? isResumable(brief) : false

  function startFresh() {
    clearBrief()
    router.push(STEPS[0].path)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-6 py-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/[0.1] text-[13px] font-semibold text-[#f5f5f5] no-underline hover:bg-white/[0.05] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al dashboard
        </Link>
      </div>

      <div className="flex-1 w-full max-w-[980px] mx-auto px-6 pb-12 flex flex-col gap-8">
        <div className="flex flex-col gap-3 max-w-[620px]">
          <h1 className="text-[34px] font-bold text-[#f5f5f5] leading-[1.15]">
            Tu marca lista en cuatro respuestas
          </h1>
          <p className="text-[15px] text-[#bdbdbd]">
            Cuéntanos qué vendes, cómo se llama, para quién es y qué estilo te gusta.
            Te devolvemos el mockup de tu producto, el logo, la etiqueta y un brandboard en PDF.
            La paleta y las tipografías ya vienen resueltas en cada estilo.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PRESETS.slice(0, 4).map((p) => (
            <Image key={p.id} src={p.thumbnail} alt={p.label} width={1024} height={1024}
                   className="w-full aspect-square object-cover rounded-2xl border border-white/[0.08]" />
          ))}
        </div>

        {resumable && brief ? (
          <div className="rounded-2xl border border-[rgba(255,156,77,0.3)] bg-[rgba(255,156,77,0.06)] p-5 flex flex-col gap-3">
            <p className="text-[14px] font-bold text-[#f5f5f5]">Tienes un brief a medias</p>
            <p className="text-[13px] text-[#bdbdbd]">
              {brief.brandName ? `${brief.brandName} · ` : ''}quedaste en la pregunta {firstIncompleteStep(brief) + 1} de 4.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => router.push(resumePath(brief))} className={btnPrimary + ' h-11 px-6'}>
                Retomar
              </button>
              <button type="button" onClick={startFresh}
                      className="h-11 px-5 rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#f5f5f5] hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent">
                Empezar de nuevo
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={startFresh} className={btnPrimary + ' h-13 px-8 self-start py-4'}>
            Crear mi marca
          </button>
        )}
      </div>
    </div>
  )
}
