'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

/**
 * Chrome compartido de los wizards: UNA pregunta por pantalla.
 * ---------------------------------------------------------------------------
 * El riel dorado de arriba es la narrativa — muestra el arco completo y dónde
 * estás parado. Dorado (posición/prestigio), nunca naranja: el naranja queda
 * reservado para la acción, así en cada pantalla hay un solo objeto cálido.
 *
 * ⚠️ El shell NO trae un "Siguiente" propio salvo que se lo pidas (`onNext`).
 * En las tools con LLM cada paso tiene su botón de enviar-y-avanzar; un
 * Siguiente genérico acá volvería a disparar la llamada al modelo al navegar.
 */

export type WizardStep = {
  /** Una o dos palabras — es lo que se lee en el riel. */
  label: string
  /** Titular de la pantalla. */
  title: string
  /** Frase corta de contexto bajo el titular. */
  hint?: string
}

export default function StepWizard({
  steps,
  current,
  maxReached,
  onNavigate,
  backHref,
  onBack,
  onReset,
  onNext,
  nextLabel = 'Continuar',
  nextDisabled,
  children,
  full,
}: {
  steps: WizardStep[]
  /** Índice 0-based del paso visible. */
  current: number
  /** Paso más avanzado alcanzado — hasta ahí se puede volver desde el riel. */
  maxReached: number
  onNavigate?: (index: number) => void
  /** Destino del botón Atrás cuando estás en el primer paso. */
  backHref?: string
  onBack?: () => void
  onReset?: () => void
  /** Acción del shell. Omitir cuando cada paso trae la suya. */
  onNext?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  children: React.ReactNode
  /** Sin caja centrada: para pasos que usan el ancho completo (editores). */
  full?: boolean
}) {
  const reduce = useReducedMotion()
  const prev = useRef(current)
  const dir = current >= prev.current ? 1 : -1
  prev.current = current

  const step = steps[current]
  const pct = ((current + 1) / steps.length) * 100

  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c0d]">
      {/* Progreso — hairline dorado, la misma luz que las cards */}
      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full transition-[width] duration-500 ease-[cubic-bezier(0.29,0.63,0.44,1)]"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, rgba(246,242,235,0.35), #e8dcd6)' }}
        />
      </div>

      {/* Barra: volver · riel · reiniciar */}
      <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0c0c0d]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[60px] w-full max-w-[1160px] items-center gap-4 px-5 md:px-8">
          {current === 0 && backHref ? (
            <Link
              href={backHref}
              className="jr-btn-ghost h-9 shrink-0 rounded-xl px-3 text-[13px] no-underline"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Atrás</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={onBack ?? (() => onNavigate?.(Math.max(0, current - 1)))}
              disabled={current === 0}
              className="jr-btn-ghost h-9 shrink-0 rounded-xl px-3 text-[13px]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Atrás</span>
            </button>
          )}

          <StepRail steps={steps} current={current} maxReached={maxReached} onNavigate={onNavigate} />

          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-1 font-sans text-[12px] font-medium text-[#a98c88] transition-colors hover:bg-white/[0.05] hover:text-[#f6f2eb] cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reiniciar</span>
            </button>
          ) : (
            <span className="ml-auto" />
          )}
        </div>
      </div>

      {/* Cuerpo — una pantalla por paso */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 18 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -18 }}
          transition={{ duration: 0.28, ease: [0.29, 0.63, 0.44, 1] }}
          className={`flex min-h-0 flex-1 flex-col ${full ? '' : 'mx-auto w-full max-w-[680px] gap-7 px-5 pb-16 pt-10 md:px-8'}`}
        >
          <header className={`flex flex-col gap-2.5 ${full ? 'mx-auto w-full max-w-[1160px] px-5 pb-6 pt-8 md:px-8' : ''}`}>
            <p className="lp-label">
              Paso {current + 1} de {steps.length}
            </p>
            <h1 className="lp-serif text-[clamp(26px,3.4vw,34px)] leading-[1.15] text-[#f6f2eb]">
              {step.title}
            </h1>
            {step.hint && (
              <p className="max-w-[60ch] font-[Archivo] text-[15px] leading-[1.6] text-[#c9b4ae]">
                {step.hint}
              </p>
            )}
          </header>

          {children}

          {onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="jr-cta h-12 w-full max-w-[320px] rounded-xl text-[14px]"
            >
              {nextLabel}
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/**
 * El riel: los pasos ya recorridos son clickables (volver no re-dispara nada;
 * cada paso guarda lo suyo). Los que faltan son hairlines apagados.
 */
function StepRail({
  steps,
  current,
  maxReached,
  onNavigate,
}: {
  steps: WizardStep[]
  current: number
  maxReached: number
  onNavigate?: (index: number) => void
}) {
  return (
    <ol className="flex min-w-0 flex-1 items-center justify-center gap-0" aria-label="Progreso del asistente">
      {steps.map((s, i) => {
        // "Hecho" = lo dejaste atrás. `maxReached` solo decide hasta dónde se
        // puede saltar: en la calculadora todos los pasos son alcanzables desde
        // el arranque y marcarlos con ✓ diría que ya los respondiste.
        const active = i === current
        const done = i < current
        const reachable = i <= maxReached && !active && !!onNavigate
        const Dot = reachable ? 'button' : 'div'

        return (
          <li key={s.label} className="flex min-w-0 items-center">
            {i > 0 && (
              <span
                aria-hidden
                className="h-px w-3 shrink-0 sm:w-6"
                style={{ background: i <= maxReached ? 'rgba(246,242,235,0.4)' : 'rgba(255,255,255,0.08)' }}
              />
            )}
            <Dot
              {...(reachable
                ? { type: 'button' as const, onClick: () => onNavigate?.(i), 'aria-label': `Volver a: ${s.label}` }
                : {})}
              aria-current={active ? 'step' : undefined}
              className={[
                'flex items-center gap-2 rounded-full border px-1 transition-all duration-300',
                reachable ? 'cursor-pointer bg-transparent hover:border-[rgba(246,242,235,0.55)]' : 'bg-transparent',
                active
                  ? 'border-[rgba(246,242,235,0.5)] pr-3 shadow-[0_0_0_3px_rgba(246,242,235,0.10)]'
                  : 'border-transparent',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border font-sans text-[11px] font-semibold transition-colors duration-300',
                  active
                    ? 'border-[rgba(246,242,235,0.6)] bg-[rgba(246,242,235,0.14)] text-[#e8dcd6]'
                    : done
                      ? 'border-[rgba(246,242,235,0.35)] bg-[rgba(246,242,235,0.08)] text-[#e8dcd6]'
                      : 'border-white/[0.1] bg-white/[0.02] text-[#a98c88]',
                ].join(' ')}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              {active && (
                <span className="hidden truncate font-sans text-[12px] font-semibold tracking-[0.02em] text-[#efe7e0] md:inline">
                  {s.label}
                </span>
              )}
            </Dot>
          </li>
        )
      })}
    </ol>
  )
}
