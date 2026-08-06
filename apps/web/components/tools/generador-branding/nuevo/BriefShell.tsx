'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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

export const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

export const chipBase =
  'px-4 h-10 rounded-xl text-[13px] font-semibold border transition-all cursor-pointer text-left'
export const chipOff = 'bg-white/[0.04] border-white/[0.08] text-[#bdbdbd] hover:text-[#f5f5f5] hover:border-white/[0.2]'
export const chipOn = 'bg-[rgba(255,156,77,0.12)] border-[rgba(255,156,77,0.5)] text-[#ff9c4d]'

/** Chrome de una pregunta del brief: barra `n de 4`, título y acción. */
export default function BriefShell({
  step,
  title,
  hint,
  children,
  onNext,
  nextDisabled,
  nextLabel = 'Continuar →',
  hideNext,
  full,
}: {
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
  const back = step === 1 ? '/tools/generador-branding' : STEPS[step - 2].path

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="h-[2px] bg-white/[0.06]">
        <div className="h-full transition-all duration-500"
             style={{ width: `${(step / STEPS.length) * 100}%`, background: 'linear-gradient(90deg,#ff9c4d,#ff7a2f)' }} />
      </div>

      <div className="px-6 py-4">
        <Link href={back} className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/[0.1] text-[13px] font-semibold text-[#f5f5f5] no-underline hover:bg-white/[0.05] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Atrás
        </Link>
      </div>

      <div className={`flex-1 w-full mx-auto flex flex-col min-h-0 ${full ? '' : 'max-w-[640px] px-6 pb-10 gap-6'}`}>
        <div className={`flex flex-col gap-2 ${full ? 'px-6 pb-5' : ''}`}>
          <p className="readout text-[11px] font-bold tracking-[1.5px] uppercase text-[#8a8a8a]">Paso {step} de {STEPS.length}</p>
          <h1 className="text-[28px] font-bold text-[#f5f5f5] leading-tight">{title}</h1>
          {hint && <p className="text-[13px] text-[#bdbdbd]">{hint}</p>}
        </div>

        {children}

        {!hideNext && (
          <button type="button" onClick={onNext} disabled={nextDisabled} className={btnPrimary + ' h-12 w-full max-w-[320px]'}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  )
}
