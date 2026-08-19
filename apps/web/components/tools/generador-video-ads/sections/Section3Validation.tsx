'use client'

import { useVideoStore } from '@/store/video'
import { canProceed } from '@/lib/video-ads/validation'
import { STEP } from '@/lib/video-ads/steps'
import { btnPrimary, btnGhost, warnBox } from './shared'

// FASE 0 en pantalla. El spec: "No avances a la adaptación final ni a la generación
// de prompts mientras una variable crítica marcada como [CONFIRMACIÓN REQUERIDA]
// siga sin resolver." Por eso el botón de avanzar está deshabilitado, no oculto:
// el usuario tiene que ver QUÉ falta y volver a completarlo.
export default function Section3Validation() {
  const { validation, setStep, patch } = useVideoStore()
  if (!validation) return null
  const ok = canProceed(validation)

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#2a0f1a]">
        <table className="w-full min-w-[520px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-[#8b8b8b]">
              <th className="px-4 py-3 font-semibold">Variable</th>
              <th className="px-4 py-3 font-semibold">Valor</th>
              <th className="px-4 py-3 font-semibold">Fuente</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {validation.rows.map((r) => (
              <tr key={r.variable} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-3 text-[#efe7e0]">{r.variable}</td>
                <td className="px-4 py-3 text-[#c9b4ae]">{r.valor}</td>
                <td className="px-4 py-3 text-[#8b8b8b]">{r.fuente}</td>
                <td className="px-4 py-3">
                  <span className={r.estado === 'CONFIRMADA' ? 'text-[#3ed88a]' : 'text-amber-300'}>
                    {r.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!ok && (
        <div className={warnBox}>
          Falta confirmar: <strong className="font-semibold">{validation.pending.join(', ')}</strong>.
          No seguimos con datos inventados — vuelve al paso anterior y complétalos.
        </div>
      )}

      {!ok && <button onClick={() => setStep(STEP.CHARACTER)} className={btnGhost}>← Volver a completar</button>}
      <button onClick={() => patch({ step: STEP.TEMPLATE })} disabled={!ok} className={btnPrimary}>
        Extraer la plantilla →
      </button>
    </div>
  )
}
