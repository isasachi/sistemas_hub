'use client'

import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useVideoStore } from '@/store/video'
import { groupIntoLotes, planoPorTiempoDe, LOTE_MAX_SEC, type Lote } from '@/lib/video-ads/lotes'
import { isInFlight, isStuck } from '@/lib/video-ads/lote-ui'
import BackToDashboard from '@/components/tools/ui/BackToDashboard'
import { btnPrimary, btnGhost, errorBox, warnBox, spinner, seg } from './shared'

const LABEL: Record<string, string> = {
  idle: 'Sin iniciar', waiting: 'En cola', queuing: 'En cola',
  generating: 'Generando', success: 'Listo', fail: 'Falló',
}

export default function Section6Lotes() {
  const { sessionId, adapted, lotes, forensicAnalysis, patch } = useVideoStore()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [running, setRunning] = useState(!!lotes?.some(isInFlight))
  // Fix round 1: un fetch que falla (red caída, tab dormido y despierto, DNS) NO
  // significa que el render terminó — el proveedor lo sigue procesando del otro
  // lado. Antes esto apagaba `running`, y como `stuck` exige que el lote NO tenga
  // `taskId` (uno en curso SÍ lo tiene), la pantalla caía en `finished` — un render
  // vivo se mostraba como terminado, con el botón de "generar otra versión" encima.
  // La solución elegida es NO cortar el polling ante un error transitorio: seguimos
  // reintentando cada 5s (un GET liviano, sin costo de LLM ni de KIE) y mostramos un
  // aviso no bloqueante y explícito ("se perdió la conexión, el render sigue") que no
  // se puede confundir con "terminado" ni con "a medias" (ese último sigue siendo
  // solo para lotes sin `taskId`, el caso real que un reintento manual puede
  // arreglar). La alternativa —un cuarto estado que bloquee la pantalla— añadía una
  // máquina de estados más sin resolver nada que el auto-reintento no resuelva ya:
  // si la caída fue transitoria, el próximo tick se recupera solo; si es persistente,
  // el aviso se queda visible hasta que se recupere o el usuario recargue.
  const [connectionLost, setConnectionLost] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Preview local: cuántos renders va a costar, ANTES de gastarlos.
  // Con el MISMO reparto que el render: sin `planoPorTiempo` esta cuenta ignoraba la
  // frontera de plano y prometía menos clips —o sea menos llamadas pagadas— de los que
  // el servidor iba a crear un click después.
  const preview = adapted
    ? groupIntoLotes(adapted.tomas, planoPorTiempoDe(forensicAnalysis?.cortes))
    : []

  useEffect(() => {
    if (!running || !sessionId) return
    const tick = async () => {
      try {
        const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/lote-status`)
        const data = (await res.json()) as { lotes?: Lote[]; done?: boolean; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'No se pudo consultar el render')
        setConnectionLost(false)
        // Fix round 5: sin esto, un error transitorio (el catch de abajo llama
        // `setError`) dejaba el aviso rojo pegado en pantalla para siempre incluso
        // después de que un tick posterior conectara bien — `connectionLost` se
        // apagaba pero `error` no, y la UI mostraba "algo requiere tu acción" sobre
        // un render que ya volvió a reportar estado con normalidad.
        setError(null)
        if (data.lotes) patch({ lotes: data.lotes })
        // `data.done` cubre el caso feliz (todo resuelto, con éxito o con un `fail`
        // explícito de KIE), pero un lote "quedó a medias" (`isStuck`) nunca lo pone
        // en `done` — se quedaría sondeando para siempre sin que nada cambie. Paramos
        // también cuando ya no queda ningún lote que pueda seguir avanzando solo.
        if (data.done || !data.lotes?.some(isInFlight)) setRunning(false)
      } catch (err) {
        // A propósito: NO se llama `setRunning(false)` acá — ver el comentario sobre
        // `connectionLost` más arriba. El `setInterval` de abajo sigue vivo y el
        // próximo tick reintenta solo.
        setError((err as Error).message)
        setConnectionLost(true)
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
        <div className="rounded-2xl border border-white/[0.06] bg-[#2a0f1a] px-4 py-4">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
            {preview.length} {preview.length === 1 ? 'lote' : 'lotes'} de máximo {LOTE_MAX_SEC} s
          </div>
          <ol className="flex flex-col gap-1.5">
            {preview.map((l) => (
              <li key={l.n} className="text-[12.5px] text-[#c9b4ae]">
                <span className="mr-2 font-mono text-[11px] text-[#8b8b8b]">Lote {l.n}</span>
                Tomas {l.tomas[0].n}–{l.tomas[l.tomas.length - 1].n} · {seg(l.duracionSeg)}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#8b8b8b]">
            {/* La cuota se cuenta por VIDEO, no por lote (ver generate-lotes/route.ts):
                un render de 4 lotes con tope de 3 generaciones NO se bloquea, porque
                sigue siendo una sola generación. Decir "consume N generaciones" era
                literalmente falso y le hacía creer al usuario que un guión de varios
                lotes no le iba a alcanzar la cuota. */}
            Esto produce <strong className="text-[#c9b4ae]">
            {preview.length} {preview.length === 1 ? 'clip' : 'clips'}</strong> en{' '}
            <strong className="text-[#c9b4ae]">
            {preview.length === 1 ? 'un render' : `${preview.length} renders`}</strong>, pero
            consume <strong className="text-[#c9b4ae]">una sola generación</strong> de tu cuota:
            se cuenta por video, no por lote. Los clips se descargan por separado y los unes
            en tu editor.
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
        // Este aviso se pinta ANTES de que el usuario pulse "Reintentar" — con lo que
        // hay en pantalla en este momento, no hay forma de saber si el guión, el
        // personaje o la voz cambiaron desde el último intento (eso lo decide el
        // servidor recién cuando llega el POST, comparando la huella de contenido).
        // Devolver el hecho (`reanuda`) en la respuesta de `generate-lotes` solo
        // podría condicionar el mensaje DESPUÉS del click, cuando este aviso ya no
        // está en pantalla — no sirve para lo que se muestra acá. Por eso se optó
        // por sacar la promesa incondicional y explicar los dos desenlaces posibles,
        // en vez de agregar un campo nuevo al contrato de la respuesta que no
        // resolvería el problema real (este texto se renderiza antes de esa respuesta).
        <div className={warnBox}>
          El render quedó a medias: algunos lotes nunca llegaron a iniciarse en KIE.
          Si desde el último intento no volviste a ningún paso anterior, reintentar solo
          crea los que faltan y no vuelve a gastar cuota. Si sí volviste —{' '}
          <strong className="font-semibold">editar una línea del guión, re-extraer la
          plantilla o rehacer el personaje ya cuentan</strong> — el servidor lo nota (la
          huella del contenido ya no coincide) y cobra una generación nueva; los intentos
          ya pagados de este render quedan abandonados.
        </div>
      )}
      {running && connectionLost && (
        // Distinto del warnBox de "a medias": el render SIGUE vivo del lado del
        // proveedor, solo se cayó el sondeo. No es un estado terminal — desaparece
        // solo apenas un tick logra conectar.
        <div className={warnBox}>
          Se perdió la conexión al consultar el render — el video sigue procesándose
          del otro lado. Reintentando automáticamente cada 5 segundos…
        </div>
      )}
      {lotes.map((l) => (
        <div key={l.n} className="rounded-2xl border border-white/[0.06] bg-[#2a0f1a] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
              Lote {l.n} · {seg(l.duracionSeg)}
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
      {/* Mientras sigue corriendo el polling, el error ya se explica arriba con el
          aviso de conexión perdida (no bloqueante) — repetirlo acá abajo en rojo
          confundiría "seguimos reintentando solos" con "algo requiere tu acción". */}
      {error && !running && <div className={errorBox}>{error}</div>}
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
            ¿No te convence? Vuelve al paso <strong className="text-[#c9b4ae]">Guión</strong> y
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
