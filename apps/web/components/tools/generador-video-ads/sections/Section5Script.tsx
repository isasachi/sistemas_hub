'use client'

import { useState } from 'react'
import { useVideoStore } from '@/store/video'
import type { AdaptedScript } from '@/lib/video-ads/adapt'
import type { VoiceProfile } from '@/lib/video-ads/character'
import { STEP } from '@/lib/video-ads/steps'
import { btnPrimary, btnGhost, errorBox, warnBox, spinner } from './shared'

// FASE 3 en pantalla + FASE 4/4.5 encadenadas: el personaje y la voz se construyen
// acá porque el usuario ya no toca nada de eso — lo definió en el paso 2. Encadenar
// las dos llamadas en un solo botón evita un paso intermedio que no aporta decisión.
export default function Section5Script() {
  const { sessionId, adapted, consistencyBlock, patch, setLoading, isLoading } = useVideoStore()
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!sessionId) return
    setLoading(true); setError(null)
    try {
      const a = await fetch(`/api/generador-video-ads/sessions/${sessionId}/adapt-script`, { method: 'POST' })
      const da = (await a.json()) as { adapted?: AdaptedScript; error?: string }
      if (!a.ok) throw new Error(da.error ?? 'No se pudo adaptar el guión')

      const c = await fetch(`/api/generador-video-ads/sessions/${sessionId}/character`, { method: 'POST' })
      const dc = (await c.json()) as { characterUrl?: string; consistencyBlock?: string; voiceProfile?: VoiceProfile; error?: string }
      if (!c.ok) throw new Error(dc.error ?? 'No se pudo construir el personaje')

      patch({
        adapted: da.adapted!,
        characterUrl: dc.characterUrl!,
        consistencyBlock: dc.consistencyBlock!,
        voiceProfile: dc.voiceProfile!,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!adapted) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] leading-relaxed text-[#8b8b8b]">
          Rellenamos la plantilla con tu producto, ángulo y avatar — respetando frase por
          frase la estructura del original — y construimos la identidad visual y vocal del
          personaje, que se repetirá idéntica en todos los lotes.
        </p>
        {error && <div className={errorBox}>{error}</div>}
        <button onClick={run} disabled={isLoading} className={btnPrimary}>
          {isLoading ? <><span className={spinner} />Adaptando el guión...</> : 'Adaptar el guión →'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
          Guión final adaptado
        </div>
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#cfcfcf]">{adapted.guionFinal}</p>
        <p className="mt-3 text-[11.5px] text-[#8b8b8b]">
          {adapted.caracteresAdaptado} caracteres ({adapted.diferenciaCaracteres >= 0 ? '+' : ''}
          {adapted.diferenciaCaracteres} vs. el original)
        </p>
      </div>

      {!!adapted.variablesPendientes.length && (
        <div className={warnBox}>
          El guión quedó con variables sin completar: <strong>{adapted.variablesPendientes.join(', ')}</strong>.
          Complétalas en los pasos anteriores — no las rellenamos por suposición, y el
          render las leería en voz alta tal cual.
        </div>
      )}

      {consistencyBlock && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
            Identidad bloqueada del personaje
          </div>
          <p className="text-[12.5px] leading-relaxed text-[#cfcfcf]">{consistencyBlock}</p>
        </div>
      )}

      {error && <div className={errorBox}>{error}</div>}
      <button
        onClick={() => patch({ step: STEP.LOTES })}
        disabled={!!adapted.variablesPendientes.length}
        className={btnPrimary}
      >
        Preparar los lotes →
      </button>
      <button onClick={run} disabled={isLoading} className={btnGhost}>
        {isLoading ? <><span className={spinner} />Reescribiendo...</> : 'No me convence — adaptar otra vez'}
      </button>
    </div>
  )
}
