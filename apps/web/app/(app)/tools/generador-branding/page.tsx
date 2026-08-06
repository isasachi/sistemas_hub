'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ImageIcon } from 'lucide-react'
import { useBrief, btnPrimary } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, clearBrief, isResumable, resumePath, firstIncompleteStep, loadLastSession } from '@/lib/branding/brief'

// 6.0 — propuesta de valor y un CTA.
// Sin registro: el gate de auth del hub vive en proxy.ts, antes de esta pantalla.
export default function GeneradorBrandingEntrada() {
  const router = useRouter()
  const { brief } = useBrief()
  // Un brief COMPLETO también se ofrece retomar: si cayera al CTA de abajo,
  // 'Crear mi marca' lo borraría sin avisar.
  const saved = brief && isResumable(brief) ? brief : null

  // La última marca generada se guarda aparte del brief: "crear otra" limpia el
  // brief pero no borra el historial, así se puede volver al resultado anterior.
  const [lastSession, setLastSession] = useState<string | null>(null)
  useEffect(() => { setLastSession(loadLastSession()) }, [])

  function startFresh() {
    clearBrief()
    router.push(STEPS[0].path)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-6 py-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/[0.1] text-[13px] font-semibold text-[#ededed] no-underline hover:bg-white/[0.05] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al dashboard
        </Link>
      </div>

      <div className="flex-1 w-full max-w-[980px] mx-auto px-6 pb-12 flex flex-col gap-8">
        <div className="flex flex-col gap-3 max-w-[620px]">
          <h1 className="text-[34px] font-bold text-[#ededed] leading-[1.15]">
            Tu marca lista en cinco respuestas
          </h1>
          <p className="text-[15px] text-[#cfcfcf]">
            Cuéntanos qué vendes, cómo se llama, para quién es y qué debe transmitir.
            Te proponemos una paleta y unas tipografías hechas para esa marca, las ajustas
            a tu gusto, y te devolvemos el mockup, el logo, la etiqueta y un brandboard en PDF.
          </p>
        </div>

        {lastSession && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-[#cfcfcf] flex-1 min-w-[220px]">
              Tu última marca generada sigue disponible.
            </p>
            <button type="button"
                    onClick={() => router.push(`/tools/generador-branding/nuevo/resultado?s=${lastSession}`)}
                    className="h-11 px-5 rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#ededed] hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Ver mi última marca
            </button>
          </div>
        )}

        {saved ? (
          <div className="rounded-2xl border border-[rgba(255,155,74,0.3)] bg-[rgba(255,155,74,0.06)] p-5 flex flex-col gap-3">
            <p className="text-[14px] font-bold text-[#ededed]">Tienes un brief a medias</p>
            <p className="text-[13px] text-[#cfcfcf]">
              {saved.brandName ? `${saved.brandName} · ` : ''}
              quedaste en la pregunta {firstIncompleteStep(saved) + 1} de {STEPS.length}.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => router.push(resumePath(saved))} className={btnPrimary + ' h-11 px-6'}>
                Retomar
              </button>
              <button type="button" onClick={startFresh}
                      className="h-11 px-5 rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#ededed] hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent">
                Empezar una marca nueva
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={startFresh} className={btnPrimary + ' h-13 px-8 self-start py-4'}>
            {lastSession ? 'Crear otra marca' : 'Crear mi marca'}
          </button>
        )}
      </div>
    </div>
  )
}
