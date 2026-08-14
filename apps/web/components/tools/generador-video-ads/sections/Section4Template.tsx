'use client'

import { useState } from 'react'
import { useVideoStore } from '@/store/video'
import type { ScriptTemplate } from '@/lib/video-ads/types'
import { STEP } from '@/lib/video-ads/steps'
import { btnPrimary, btnGhost, errorBox, warnBox, spinner, seg } from './shared'

// Muestra los tres artefactos de la FASE 1-2: el guión literal del original, los
// cortes detectados y el guión convertido a Fill in the Blank. El usuario tiene que
// poder ver QUÉ se conservó del original — es la promesa del sistema de plantillas.
export default function Section4Template() {
  const { sessionId, forensicAnalysis, template, patch, setLoading, isLoading } = useVideoStore()
  // Tomas donde el andamiaje de la plantilla dejó de ser copia literal del corte. No es
  // fatal (la locución se conserva), pero sí significa que en esas tomas no se pudo
  // corregir el nombre de los huecos y que el guión puede haberse desviado del original.
  const [desalineadas, setDesalineadas] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  async function extract() {
    if (!sessionId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/extract-template`, { method: 'POST' })
      const data = (await res.json()) as { template?: ScriptTemplate; desalineadas?: number[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo extraer la plantilla')
      patch({ template: data.template! })
      setDesalineadas(data.desalineadas ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const card = (title: string, children: React.ReactNode) => (
    <div className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">{title}</div>
      {children}
    </div>
  )

  if (!template) {
    return (
      <div className="flex flex-col gap-5">
        {forensicAnalysis && card('Guión del original (literal)', (
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#cfcfcf]">
            {forensicAnalysis.guionOriginal}
          </p>
        ))}
        {forensicAnalysis && card(`Cortes detectados — ${forensicAnalysis.cortes.length}`, (
          <ol className="flex flex-col gap-2">
            {forensicAnalysis.cortes.map((c) => (
              <li key={c.n} className="flex gap-3">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-[#8b8b8b]">{c.tiempo}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[12.5px] leading-relaxed text-[#ededed]">{c.accion}</span>
                  <span className="text-[11.5px] leading-relaxed text-[#8b8b8b]">{c.camara}</span>
                </span>
              </li>
            ))}
          </ol>
        ))}
        {error && <div className={errorBox}>{error}</div>}
        <button onClick={extract} disabled={isLoading} className={btnPrimary}>
          {isLoading ? <><span className={spinner} />Extrayendo la plantilla...</> : 'Extraer la plantilla →'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {!!desalineadas.length && (
        <div className={warnBox}>
          {desalineadas.length === 1
            ? `En la toma ${desalineadas[0]} la plantilla no copió el guión palabra por palabra`
            : `En ${desalineadas.length} tomas (${desalineadas.join(', ')}) la plantilla no copió el guión palabra por palabra`}
          {' '}— revísalas abajo contra el original, o vuelve a extraer. Pasa sobre todo en
          videos sin cortes, donde una sola toma trae el guión entero.
        </div>
      )}
      {card('Guión convertido a Fill in the Blank', (
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#cfcfcf]">
          {template.guionFillInBlank}
        </p>
      ))}
      {card(`Tomas — ${template.tomas.length}`, (
        <ol className="flex flex-col gap-2">
          {template.tomas.map((t) => (
            <li key={t.n} className="flex gap-3">
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-[#8b8b8b]">{seg(t.duracionSeg)}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[12.5px] leading-relaxed text-[#ededed]">“{t.locucion}”</span>
                <span className="text-[11.5px] leading-relaxed text-[#8b8b8b]">{t.accionVisual}</span>
              </span>
            </li>
          ))}
        </ol>
      ))}
      <p className="text-[12px] leading-relaxed text-[#8b8b8b]">{template.resumenParaUsuario}</p>
      {error && <div className={errorBox}>{error}</div>}
      {/* Este paso era el ÚLTIMO del wizard cuando se escribió, así que no necesitaba
          salida. Al agregarse los pasos de guión y lotes detrás, nadie cableó el avance:
          la plantilla quedaba sin botón para continuar y el riel tampoco servía, porque
          solo deja navegar hasta el paso más avanzado ALCANZADO — que era este. Sesión
          sin salida. El avance es del cliente, no de una ruta: la ruta que escribe
          `STEP.SCRIPT` es la de adaptación, que corre cuando el usuario YA está allá. */}
      <button onClick={() => patch({ step: STEP.SCRIPT })} className={btnPrimary}>
        Escribir mi guión →
      </button>
      <button onClick={extract} disabled={isLoading} className={btnGhost}>
        {isLoading ? <><span className={spinner} />Reextrayendo...</> : 'Extraer otra vez'}
      </button>
    </div>
  )
}
