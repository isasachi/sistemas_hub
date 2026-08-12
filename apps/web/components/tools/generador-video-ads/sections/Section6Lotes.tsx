'use client'

import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useVideoStore } from '@/store/video'
import { groupIntoLotes, type Lote } from '@/lib/video-ads/lotes'
import BackToDashboard from '@/components/tools/ui/BackToDashboard'
import { btnPrimary, btnGhost, errorBox, warnBox, spinner } from './shared'

const LABEL: Record<string, string> = {
  idle: 'Sin iniciar', waiting: 'En cola', queuing: 'En cola',
  generating: 'Generando', success: 'Listo', fail: 'Falló',
}

// Un lote con `taskId` y sin `videoUrl` (y sin `status: 'fail'`) todavía puede
// cambiar de estado en el próximo sondeo — es el único caso que justifica seguir
// llamando a `lote-status`.
function isInFlight(l: Lote): boolean {
  return !!l.taskId && !l.videoUrl && l.status !== 'fail'
}

// Un lote SIN `taskId` nunca arrancó una tarea en KIE: quedó así porque el loop de
// `generate-lotes` se cortó a mitad de camino (prompt que no entró en el tope, o un
// fallo de red/API) — ver el rescate parcial documentado en esa ruta. No tiene
// identificador que consultar, así que jamás va a resolverse por sí solo con
// `lote-status`; `done` tampoco lo cuenta como terminado. Es el único caso que un
// reintento explícito (`resume: true`) puede arreglar.
function isStuck(l: Lote): boolean {
  return !l.taskId && !l.videoUrl
}

export default function Section6Lotes() {
  const { sessionId, adapted, lotes, patch } = useVideoStore()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [running, setRunning] = useState(!!lotes?.some(isInFlight))
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Preview local: cuántos renders va a costar, ANTES de gastarlos.
  const preview = adapted ? groupIntoLotes(adapted.tomas) : []

  useEffect(() => {
    if (!running || !sessionId) return
    const tick = async () => {
      try {
        const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/lote-status`)
        const data = (await res.json()) as { lotes?: Lote[]; done?: boolean; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'No se pudo consultar el render')
        if (data.lotes) patch({ lotes: data.lotes })
        // `data.done` cubre el caso feliz (todo resuelto, con éxito o con un `fail`
        // explícito de KIE), pero un lote "quedó a medias" (`isStuck`) nunca lo pone
        // en `done` — se quedaría sondeando para siempre sin que nada cambie. Paramos
        // también cuando ya no queda ningún lote que pueda seguir avanzando solo.
        if (data.done || !data.lotes?.some(isInFlight)) setRunning(false)
      } catch (err) {
        setError((err as Error).message)
        setRunning(false)
      }
    }
    tick()
    timer.current = setInterval(tick, 5000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [running, sessionId, patch])

  // `resume` es la intención que manda la UI, no el hecho: el servidor decide, con
  // la huella del contenido, si esto es una reanudación real (no cobra) o una
  // generación nueva (cobra). Acá se manda `resume: true` tanto para reintentar un
  // render que quedó a medias como para pedir otra versión después de haber vuelto
  // al paso anterior a re-adaptar el guión — en los dos casos la sesión ya tiene
  // `lotes` guardados. Solo el primer render de una sesión nueva va sin el flag.
  async function submit(resume: boolean) {
    if (!sessionId || submitting) return // primera defensa contra doble submit: el server tiene la suya
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/generate-lotes`, {
        method: 'POST',
        ...(resume
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume: true }) }
          : {}),
      })
      const data = (await res.json()) as { lotes?: Lote[]; error?: string }
      // El 400 de un prompt que no entra en el tope de KIE también trae `lotes`: el
      // rescate parcial con los placeholders `idle` de lo que sí se guardó. Reflejarlo
      // ANTES de lanzar el error evita que las tarjetas en pantalla queden mostrando
      // un estado viejo hasta el próximo reload — justo lo que necesita el botón de
      // reintentar para saber qué falta.
      if (data.lotes) patch({ lotes: data.lotes })
      if (!res.ok) throw new Error(data.error ?? 'No se pudo iniciar el render')
      setRunning(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!lotes?.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
            {preview.length} {preview.length === 1 ? 'lote' : 'lotes'} de máximo 15 s
          </div>
          <ol className="flex flex-col gap-1.5">
            {preview.map((l) => (
              <li key={l.n} className="text-[12.5px] text-[#cfcfcf]">
                <span className="mr-2 font-mono text-[11px] text-[#8b8b8b]">Lote {l.n}</span>
                Tomas {l.tomas[0].n}–{l.tomas[l.tomas.length - 1].n} · {l.duracionSeg}s
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#8b8b8b]">
            Cada lote es un render aparte: esto consume <strong className="text-[#cfcfcf]">
            {preview.length} {preview.length === 1 ? 'generación' : 'generaciones'}</strong> de tu cuota.
            Los clips se descargan por separado y los unes en tu editor.
          </p>
        </div>
        {error && <div className={errorBox}>{error}</div>}
        <button onClick={() => submit(false)} disabled={submitting} className={btnPrimary}>
          {submitting ? <><span className={spinner} />Iniciando el render...</> : `Generar los ${preview.length} lotes →`}
        </button>
      </div>
    )
  }

  // Tres estados posibles, en este orden de prioridad: sigue renderizando (spinners
  // por lote, sin botón — el polling de arriba se encarga solo); quedó a medias
  // (algún lote sin `taskId`, no queda nada progresando: hace falta un reintento
  // explícito); o terminado (nada progresando y nada a medias, aunque algún lote
  // individual haya salido `fail` de KIE — eso se ve en su tarjeta).
  const stuck = !running && lotes.some(isStuck)
  const finished = !running && !stuck

  return (
    <div className="flex flex-col gap-4">
      {stuck && (
        <div className={warnBox}>
          El render quedó a medias: algunos lotes nunca llegaron a iniciarse en KIE.
          Reintentar solo crea los que faltan — no vuelve a gastar cuota por los que
          ya se generaron.
        </div>
      )}
      {lotes.map((l) => (
        <div key={l.n} className="rounded-2xl border border-white/[0.06] bg-[#121214] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
              Lote {l.n} · {l.duracionSeg}s
            </span>
            <span className="text-[11.5px] text-[#8b8b8b]">{LABEL[l.status] ?? l.status}</span>
          </div>
          {l.videoUrl ? (
            <>
              <video src={l.videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
              <a
                href={`${l.videoUrl}${l.videoUrl.includes('?') ? '&' : '?'}download=lote-${l.n}.mp4`}
                download
                className={`${btnPrimary} mt-2`}
              >
                <Download className="h-4 w-4" strokeWidth={1.8} />Descargar lote {l.n}
              </a>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.02] py-8">
              {!isStuck(l) && l.status !== 'fail' && <span className={spinner} />}
              <span className="text-[12px] text-[#8b8b8b]">
                {l.status === 'fail' ? (l.failMsg || 'Este lote falló') : isStuck(l) ? 'Sin iniciar' : 'Renderizando…'}
              </span>
            </div>
          )}
        </div>
      ))}
      {error && <div className={errorBox}>{error}</div>}
      {stuck && (
        <button onClick={() => submit(true)} disabled={submitting} className={btnPrimary}>
          {submitting ? <><span className={spinner} />Reintentando...</> : 'Reintentar el render →'}
        </button>
      )}
      {finished && (
        <div className="flex flex-col gap-2">
          {/* Honesto sobre lo que este botón hace de verdad: solo produce un video
              distinto si el guión, el personaje o la voz cambiaron desde este render
              (la huella de contenido deja de coincidir). Si nada cambió, el servidor
              devuelve los mismos lotes sin gastar cuota — silencioso, no un error. */}
          <p className="text-[11.5px] leading-relaxed text-[#8b8b8b]">
            ¿No te convence? Vuelve al paso <strong className="text-[#cfcfcf]">Guión</strong> y
            adáptalo otra vez antes de generar de nuevo — si no cambia nada, este botón
            no crea una versión distinta.
          </p>
          <button onClick={() => submit(true)} disabled={submitting} className={btnGhost}>
            {submitting ? <><span className={spinner} />Generando...</> : 'Generar otra versión →'}
          </button>
        </div>
      )}
      <BackToDashboard className="w-full" />
    </div>
  )
}
