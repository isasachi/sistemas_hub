'use client'

/**
 * Momento de generación unificado: barra de progreso + ticks de etapa opcionales.
 * Firma visual compartida entre las tools generativas (anuncios SSE por-etapa,
 * landing por-sección). Los números van en `.readout` (mono).
 */
export function GenerationProgress({
  percent,
  label,
  hint,
  steps,
  currentStep,
}: {
  percent: number
  label: string
  hint?: string
  /** Etiquetas de etapa (opcional). Si se pasan, se dibujan los ticks. */
  steps?: string[]
  /** Índice de la etapa en curso (para colorear los ticks). */
  currentStep?: number
}) {
  const pct = Math.max(0, Math.min(100, percent))
  const cur = currentStep ?? 0
  return (
    <div>
      <div className="flex justify-between text-[11px] text-[#c9b4ae] mb-1.5">
        <span>{label}</span>
        <span className="readout text-[#e8467a] font-bold">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#e8467a,#bd1347)' }}
        />
      </div>
      {steps && steps.length > 0 && (
        <>
          <div className="flex gap-1 mt-2">
            {steps.map((s, idx) => (
              <div
                key={s}
                className="flex-1 h-[2px] rounded-full transition-colors duration-500"
                style={{
                  background:
                    idx < cur ? '#3ed88a' :
                    idx === cur ? 'linear-gradient(90deg,#e8467a,#bd1347)' :
                    'rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-[#a98c88] mt-1">
            {steps.map((s) => <span key={s}>{s}</span>)}
          </div>
        </>
      )}
      {hint && <p className="text-[11px] text-[#a98c88] mt-2 text-center">{hint}</p>}
    </div>
  )
}
