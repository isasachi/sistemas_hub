'use client'

import { regenButtonState } from '@/lib/regen-button-state'

interface RegenControlsProps {
  regensLeft: number | null
  prompt: string
  onPromptChange: (v: string) => void
  onRegenerate: () => void
  busy?: boolean
  label?: string
}

// Control compartido de regeneración: textarea opcional de precisión + botón +
// contador "Quedan N de 3" (solo si regensLeft es number). Sin estado propio.
export function RegenControls({
  regensLeft, prompt, onPromptChange, onRegenerate, busy = false, label = '↻ Regenerar',
}: RegenControlsProps) {
  const { disabled, showCounter, reason } = regenButtonState(regensLeft, busy)
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={2}
        placeholder="Opcional: dile qué ajustar — ej: más minimalista, fondo azul"
        className="bg-[#141414] border border-white/[0.06] rounded-xl px-3 py-2 text-[13px] text-[#f5f5f5] placeholder:text-[#8a8a8a] focus:border-[rgba(255,156,77,0.5)] outline-none resize-none"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={onRegenerate}
          disabled={disabled}
          className="h-10 px-4 rounded-xl border border-white/[0.14] text-[#f5f5f5] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent disabled:opacity-40"
        >
          {busy ? 'Regenerando...' : label}
        </button>
        {showCounter && (
          <span className="text-[12px] text-[#8a8a8a]">
            Quedan {Math.max(0, regensLeft as number)} de 3 regeneraciones
          </span>
        )}
      </div>
      {reason && <p className="text-[12px] text-[#bdbdbd]">{reason}</p>}
    </div>
  )
}
