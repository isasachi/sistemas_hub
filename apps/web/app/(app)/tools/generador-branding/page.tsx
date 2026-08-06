'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Clock, ImageIcon } from 'lucide-react'
import ToolShell from '@/components/tools/ui/ToolShell'
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
    <ToolShell name="Generador de Branding">
      <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-8 px-5 pb-16 pt-12 md:px-8">
        <div className="jr-rise flex max-w-[640px] flex-col gap-4">
          <h1 className="lp-serif text-[clamp(28px,3.8vw,38px)] leading-[1.15] text-[#ffffff]">
            Tu marca lista en cinco respuestas
          </h1>
          <p className="font-[Lato] text-[15px] leading-[1.65] text-[#cfcfcf]">
            Cuéntanos qué vendes, cómo se llama, para quién es y qué debe transmitir.
            Te proponemos una paleta y unas tipografías hechas para esa marca, las ajustas
            a tu gusto, y te devolvemos el mockup, el logo, la etiqueta y un brandboard en PDF.
          </p>
        </div>

        {lastSession && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="min-w-[220px] flex-1 text-[13px] text-[#cfcfcf]">
              Tu última marca generada sigue disponible.
            </p>
            <button type="button"
                    onClick={() => router.push(`/tools/generador-branding/nuevo/resultado?s=${lastSession}`)}
                    className="jr-btn-ghost h-11 rounded-xl px-5 text-[13px] cursor-pointer">
              <ImageIcon className="w-4 h-4" /> Ver mi última marca
            </button>
          </div>
        )}

        {saved ? (
          <div className="jr-card lp-leak flex flex-col gap-3 rounded-2xl p-5">
            <p className="relative font-sans text-[14px] font-semibold text-[#ffffff]">Tienes un brief a medias</p>
            <p className="relative text-[13px] text-[#cfcfcf]">
              {saved.brandName ? `${saved.brandName} · ` : ''}
              quedaste en la pregunta {firstIncompleteStep(saved) + 1} de {STEPS.length}.
            </p>
            <div className="relative flex flex-wrap gap-3">
              <button type="button" onClick={() => router.push(resumePath(saved))}
                      className="jr-btn-secondary h-11 rounded-xl px-5 text-[13px] cursor-pointer">
                <Clock className="w-4 h-4" /> Retomar
              </button>
              <button type="button" onClick={startFresh}
                      className="jr-btn-ghost h-11 rounded-xl px-5 text-[13px] cursor-pointer">
                Empezar una marca nueva
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={startFresh} className={btnPrimary + ' h-13 self-start rounded-xl px-8 py-4 text-[15px] cursor-pointer'}>
            {lastSession ? 'Crear otra marca' : 'Crear mi marca'}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </ToolShell>
  )
}
