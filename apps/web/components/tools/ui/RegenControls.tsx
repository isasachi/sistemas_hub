'use client'

interface RegenControlsProps {
  prompt: string
  onPromptChange: (v: string) => void
  onRegenerate: () => void
  busy?: boolean
  label?: string
}

// Control compartido de regeneración: textarea opcional de precisión + botón. Sin estado
// propio. Sin contador: el único tope son los créditos del plan (ver lib/gen-quota.ts), y
// cuando se acaban la ruta devuelve el error que el caller ya muestra.
export function RegenControls({
  prompt, onPromptChange, onRegenerate, busy = false, label = '↻ Regenerar',
}: RegenControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={2}
        placeholder="Opcional: dile qué ajustar — ej: más minimalista, fondo azul"
        className="jr-field rounded-xl px-3 py-2 text-[13px] resize-none"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="h-10 px-4 rounded-xl border border-white/[0.14] text-[#efe7e0] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent disabled:opacity-40"
        >
          {busy ? 'Regenerando...' : label}
        </button>
      </div>
    </div>
  )
}
