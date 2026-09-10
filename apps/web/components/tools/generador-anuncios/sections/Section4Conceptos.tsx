'use client'

import { useState } from 'react'
import { useWizardStore } from '@/store/wizard'
import { STEP } from '@/lib/anuncios/steps'

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'
const btnGhost = 'h-11 w-full rounded-xl border border-white/[0.06] bg-transparent text-[13px] text-[#c9b4ae] hover:border-white/20 transition-all duration-200 cursor-pointer font-sans'

/**
 * Revisar los conceptos — paso 4 del flujo de plantilla.
 *
 * ⚠️ ESTE PASO EXISTE POR LOS CRÉDITOS. El lote entero se planifica en TEXTO (gratis) y recién
 * después se renderizan las imágenes (un crédito cada una). Mostrar los N conceptos con su copy
 * antes de gastar nada es lo que convierte "no me convence" en volver a planificar en vez de en
 * un lote pagado a la basura.
 */
export default function Section4Conceptos() {
  const { variants, setStep } = useWizardStore()
  const [abierta, setAbierta] = useState<string | null>(null)

  // Nunca devolver null: una sección en blanco se lee como una tool rota. Con el guard de flujo
  // del wizard esto no debería pasar, pero si pasa hay que poder salir.
  if (!variants || variants.length === 0)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-[#c9b4ae]">Todavía no hay un lote planificado.</p>
        <button onClick={() => setStep(STEP.LOTE)} className={btnPrimary}>Planificar el lote →</button>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] leading-snug text-[#c9b4ae]">
        {variants.length === 1
          ? 'Este es el concepto del anuncio. Revísalo antes de generar la imagen.'
          : `${variants.length} conceptos distintos sobre la misma plantilla. Cada uno ataca un ángulo diferente — revísalos antes de gastar créditos.`}
      </p>

      <div className="flex flex-col gap-3">
        {variants.map((v, i) => {
          const abierto = abierta === v.id
          return (
            <div key={v.id} className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#14050a]">
              <button
                type="button"
                onClick={() => setAbierta(abierto ? null : v.id)}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left cursor-pointer"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#E8467A]">
                    Anuncio {i + 1}
                  </span>
                  <span className="text-[13px] font-bold text-[#F6F2EB]">{v.concepto}</span>
                </div>
                <span className="text-[11px] leading-snug text-[#c9b4ae]">{v.angulo}</span>
              </button>

              {abierto && (
                <div className="flex flex-col gap-2 border-t border-white/[0.06] px-4 py-3">
                  {v.slots.map((s) => (
                    <div key={s.slot} className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-[#8a7a76]">{s.slot}</span>
                      <span className="text-[12px] leading-snug text-[#F6F2EB]">{s.texto}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button onClick={() => setStep(STEP.ANUNCIOS)} className={btnPrimary}>
        Generar {variants.length === 1 ? 'el anuncio' : `los ${variants.length} anuncios`} →
      </button>
      {/* Volver a planificar es gratis: el paso anterior es solo texto. */}
      <button onClick={() => setStep(STEP.LOTE)} className={btnGhost}>
        No me convencen — planificar otra vez
      </button>
    </div>
  )
}
