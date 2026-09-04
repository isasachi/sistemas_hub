'use client'

import { useState } from 'react'
import { useVideoStore } from '@/store/video'
import type { ScriptTemplate } from '@/lib/video-ads/types'
import { STEP } from '@/lib/video-ads/steps'
import { groupIntoLotes, planoPorTiempoDe, LOTE_MAX_SEC } from '@/lib/video-ads/lotes'
import { segmentar } from '@/lib/video-ads/segments'
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

  // En cuántos clips va a salir el video. El generador topa en LOTE_MAX_SEC por llamada,
  // así que
  // un corte más largo se parte en FASE 5 (`splitLongToma`, regla 7 del spec) por pausas
  // del guión. Se calcula ACÁ, con la misma función que usa el render, porque es donde el
  // usuario se forma la expectativa: leer "Cortes detectados — 1" sobre un video de 33 s
  // hace pensar que no se cortó nada, cuando en realidad saldrán 3 clips. Antes eso solo
  // se veía en el paso 7, después de haber pasado por la plantilla y el guión.
  const clips = forensicAnalysis
    ? groupIntoLotes(forensicAnalysis.cortes.map((c) => ({
        n: c.n, duracionSeg: c.duracionSeg, locucion: c.dialogo, tiempoOriginal: c.tiempo,
        accionVisual: c.accion, personaje: '', producto: '',
      })))
    : []

  const card = (title: string, children: React.ReactNode) => (
    <div className="rounded-2xl border border-white/[0.06] bg-[#2a0f1a] px-4 py-4">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">{title}</div>
      {children}
    </div>
  )

  if (!template) {
    return (
      <div className="flex flex-col gap-5">
        {forensicAnalysis && card('Guión del original (literal)', (
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#c9b4ae]">
            {forensicAnalysis.guionOriginal}
          </p>
        ))}
        {forensicAnalysis && clips.length > forensicAnalysis.cortes.length && (
          <div className="rounded-2xl border border-white/[0.06] bg-[#2a0f1a] px-4 py-3 text-[12px] leading-relaxed text-[#8b8b8b]">
            Este video es <strong className="text-[#c9b4ae]">una toma continua de {seg(forensicAnalysis.duracionTotalSeg)}</strong>,
            sin cortes de edición — el análisis está bien. Pero el generador no produce más
            de {LOTE_MAX_SEC} s por clip, así que al renderizar se dividirá en{' '}
            <strong className="text-[#c9b4ae]">{clips.length} clips</strong> ({clips.map((l) => seg(l.duracionSeg)).join(' · ')}),
            cortando en pausas del guión. No se pierde una sola palabra; los descargas por
            separado y los unes en tu editor.
          </div>
        )}
        {forensicAnalysis && card(`Cortes detectados — ${forensicAnalysis.cortes.length}`, (
          <ol className="flex flex-col gap-2">
            {forensicAnalysis.cortes.map((c) => (
              <li key={c.n} className="flex gap-3">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-[#8b8b8b]">{c.tiempo}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[12.5px] leading-relaxed text-[#efe7e0]">{c.accion}</span>
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
      {card('Guión convertido en plantilla', (
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#c9b4ae]">
          {template.guionFillInBlank}
        </p>
      ))}
      {card(`Tomas — ${template.tomas.length}`, (
        <ol className="flex flex-col gap-2">
          {template.tomas.map((t) => (
            <li key={t.n} className="flex gap-3">
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-[#8b8b8b]">{seg(t.duracionSeg)}</span>
              <span className="flex flex-col gap-0.5">
                {/* Partida por frase, igual que el editor del paso siguiente: en un video
                    sin cortes una sola toma trae el guión entero, y verlo como un párrafo
                    de 700 caracteres esconde la estructura que después se renderiza por
                    separado. Es presentación — el dato sigue siendo una locución por toma. */}
                {segmentar(t.locucion).map((f, j) => (
                  <span key={j} className="text-[12.5px] leading-relaxed text-[#efe7e0]">
                    {segmentar(t.locucion).length > 1 && (
                      <span className="mr-1.5 font-mono text-[10px] text-[#6b6b6b]">{j + 1}</span>
                    )}
                    {f}
                  </span>
                ))}
                <span className="mt-0.5 text-[11.5px] leading-relaxed text-[#8b8b8b]">{t.accionVisual}</span>
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
