'use client'

import { useState } from 'react'
import { useVideoStore } from '@/store/video'
import { ChipGroup } from '@/components/tools/ui/ChipGroup'
import type { ScriptBeat, ScriptTemplate, ScriptVersions, VideoDirection } from '@/lib/video-ads/types'
import { btnPrimary, btnGhost, errorBox, spinner } from './shared'

// El rango del render es 1–15 s (grok-imagine-video-1-5-preview). Si se cambia de
// modelo, este es uno de los tres sitios que se mueven (los otros: MIN/MAX_DURATION
// y los asserts de kie.test.ts).
const DURATIONS = ['6 s', '10 s', '15 s']

function BeatList({ beats }: { beats: ScriptBeat[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {beats.map((b, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 shrink-0 font-mono text-[11px] text-[#8b8b8b]">{b.t}</span>
          <span className="flex flex-col gap-1">
            {b.dialogue && <span className="text-[13px] leading-relaxed text-[#ededed]">“{b.dialogue}”</span>}
            <span className="text-[12px] leading-relaxed text-[#8b8b8b]">{b.action}</span>
            {b.onScreenText && (
              <span className="text-[11px] uppercase tracking-wide text-[#ff9b4a]">{b.onScreenText}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

export default function Section3Script() {
  const s = useVideoStore()
  const { sessionId, mode, scriptTemplate, scriptVersions, patch, setLoading, isLoading } = s
  const [duration, setDuration] = useState('10 s')
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (!sessionId || isLoading) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSec: parseInt(duration, 10) }),
      })
      const data = (await res.json()) as {
        template?: ScriptTemplate; versions?: ScriptVersions
        direction?: VideoDirection; duration?: number; error?: string
      }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo escribir el guión')
      patch({
        scriptTemplate: data.template ?? null,
        scriptVersions: data.versions!,
        direction: data.direction ?? null,
        duration: data.duration ?? null,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function choose(version: 'A' | 'B') {
    if (!sessionId || !scriptVersions || isLoading) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/confirm-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      })
      if (!res.ok) throw new Error('No se pudo guardar tu elección')
      const beats = version === 'A' ? scriptVersions.versionA : scriptVersions.versionB
      patch({ confirmedScript: { version, beats }, step: 4 })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!scriptVersions) {
    return (
      <div className="flex flex-col gap-5">
        {mode !== 'video-ref' && (
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-[#ededed]">¿Cuánto debe durar?</span>
            <ChipGroup options={DURATIONS} selected={duration} onChange={(v) => setDuration(v as string)} />
          </div>
        )}
        {mode === 'video-ref' && (
          <p className="text-[12.5px] leading-relaxed text-[#8b8b8b]">
            Vamos a sacar el esqueleto del guión de tu referencia y a rellenarlo con tu producto.
            La duración la marca el video original.
          </p>
        )}
        {error && <div className={errorBox}>{error}</div>}
        <button onClick={generate} disabled={isLoading} className={btnPrimary}>
          {isLoading ? <><span className={spinner} />Escribiendo el guión...</> : 'Escribir el guión →'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* El esqueleto es el producto intelectual de la rama con referencia: se muestra
          para que se vea QUÉ se conservó del original y qué se cambió. */}
      {scriptTemplate && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
            Plantilla de la referencia
          </div>
          <ol className="flex flex-col gap-1.5">
            {scriptTemplate.slots.map((slot, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed text-[#cfcfcf]">
                <span className="mr-2 font-mono text-[11px] text-[#8b8b8b]">{slot.t}</span>
                {slot.pattern}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] leading-relaxed text-[#8b8b8b]">{scriptTemplate.summaryForUser}</p>
        </div>
      )}

      {(['A', 'B'] as const).map((v) => (
        <div key={v} className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#ff9b4a]">Versión {v}</div>
          <BeatList beats={v === 'A' ? scriptVersions.versionA : scriptVersions.versionB} />
          <button onClick={() => choose(v)} disabled={isLoading} className={`${btnPrimary} mt-4`}>
            Usar la versión {v} →
          </button>
        </div>
      ))}

      {error && <div className={errorBox}>{error}</div>}
      <button onClick={generate} disabled={isLoading} className={btnGhost}>
        {isLoading
          ? <><span className={spinner} />Reescribiendo...</>
          : 'No me convence — escribir otras dos versiones'}
      </button>
    </div>
  )
}
