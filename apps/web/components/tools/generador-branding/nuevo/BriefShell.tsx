'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import StepWizard from '@/components/tools/ui/StepWizard'
import { loadBrief, saveBrief, STEPS, type PartialBrief } from '@/lib/branding/brief'

/**
 * Estado del brief para las pantallas del wizard. `brief === null` = todavía sin
 * hidratar desde localStorage (primer render del cliente); las pantallas no
 * pintan sus campos hasta tenerlo, si no un F5 mostraría un formulario vacío
 * medio segundo antes de rellenarse.
 */
export function useBrief() {
  const [brief, setBrief] = useState<PartialBrief | null>(null)
  useEffect(() => { setBrief(loadBrief()) }, [])
  const update = useCallback((patch: PartialBrief) => { setBrief(saveBrief(patch)) }, [])
  return { brief, update }
}

export const btnPrimary = 'jr-cta rounded-xl text-[14px] font-semibold font-sans'

export const chipBase =
  'px-4 h-10 rounded-xl text-[13px] font-semibold font-sans border transition-all duration-200 cursor-pointer text-left'
export const chipOff =
  'bg-white/[0.03] border-white/[0.08] text-[#c9b4ae] hover:text-[#f6f2eb] hover:border-[rgba(232,70,122,0.35)] hover:bg-[rgba(232,70,122,0.06)]'
export const chipOn =
  'bg-[rgba(232,70,122,0.12)] border-[rgba(232,70,122,0.5)] text-[#e8467a]'

const WIZARD_STEPS = STEPS.map((s) => ({ label: s.label, title: s.title }))

/** Chrome de una pregunta del brief. Cada paso es una ruta propia, así que
 *  navegar por el riel es un `router.push` — nada se re-envía al volver. */
export default function BriefShell({
  step,
  title,
  hint,
  children,
  onNext,
  nextDisabled,
  nextLabel = 'Continuar',
  hideNext,
  full,
}: {
  /** 1-based, como lo numeran las páginas del brief. */
  step: number
  title: string
  hint?: string
  children: React.ReactNode
  onNext?: () => void
  nextDisabled?: boolean
  nextLabel?: string
  hideNext?: boolean
  /** Sin caja centrada: el editor del paso 5 usa el ancho completo. */
  full?: boolean
}) {
  const router = useRouter()
  const index = step - 1
  // El título/hint de la pantalla mandan sobre el catálogo: algunos pasos los
  // afinan según lo que ya respondiste.
  const steps = WIZARD_STEPS.map((s, i) => (i === index ? { ...s, title, hint } : s))

  return (
    <StepWizard
      steps={steps}
      current={index}
      maxReached={index}
      onNavigate={(i) => router.push(STEPS[i].path)}
      backHref="/tools/generador-branding"
      onNext={hideNext ? undefined : onNext}
      nextLabel={nextLabel}
      nextDisabled={nextDisabled}
      full={full}
    >
      {children}
    </StepWizard>
  )
}
