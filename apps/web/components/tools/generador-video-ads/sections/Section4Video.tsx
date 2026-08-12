'use client'

import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useVideoStore } from '@/store/video'
import BackToDashboard from '@/components/tools/ui/BackToDashboard'
import { btnPrimary, btnGhost, errorBox, spinner } from './shared'

const LABEL: Record<string, string> = {
  waiting: 'En cola',
  queuing: 'En cola',
  generating: 'Generando el video',
  success: 'Listo',
  fail: 'Falló',
}

export default function Section4Video() {
  const { sessionId, videoUrl, videoStatus, confirmedScript, patch, regens, setRegens } = useVideoStore()
  const [running, setRunning] = useState(!videoUrl && !!videoStatus && videoStatus !== 'fail')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Polling: el render tarda minutos, así que no hay conexión abierta que sostener —
  // preguntamos cada 5s por el estado de la tarea guardada en la sesión.
  useEffect(() => {
    if (!running || !sessionId) return
    const tick = async () => {
      try {
        const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/video-status`)
        const data = (await res.json()) as { state?: string; progress?: number; videoUrl?: string | null; error?: string | null }
        if (!res.ok) throw new Error(data.error ?? 'No se pudo consultar el render')
        setProgress(data.progress ?? 0)
        patch({ videoStatus: data.state ?? null })
        if (data.videoUrl) { patch({ videoUrl: data.videoUrl }); setRunning(false) }
        else if (data.state === 'fail') { setError(data.error ?? 'El render falló'); setRunning(false) }
      } catch (err) {
        setError((err as Error).message)
        setRunning(false)
      }
    }
    tick()
    timer.current = setInterval(tick, 5000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [running, sessionId, patch])

  // Edición del copy en la pantalla previa. Solo texto: NO se agregan ni borran beats
  // porque en la línea `video-ref` el número y el orden de los tramos son el esqueleto
  // de la referencia — el wizard promete "esto se conservó del original".
  function editBeat(i: number, field: 'dialogue' | 'onScreenText', value: string) {
    if (!confirmedScript) return
    const beats = confirmedScript.beats.map((b, j) => (j === i ? { ...b, [field]: value } : b))
    patch({ confirmedScript: { ...confirmedScript, beats } })
    dirty.current = true
  }

  // Se guarda en cada blur, no al darle a "Generar": si el usuario edita y recarga (o
  // se va por el riel al paso 3 y vuelve), Section4Video rehidrata desde la DB y las
  // ediciones se habrían perdido en silencio.
  async function saveScript(): Promise<boolean> {
    if (!sessionId || !confirmedScript || !dirty.current) return true
    dirty.current = false
    setSaving(true)
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/confirm-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: confirmedScript.version, beats: confirmedScript.beats }),
      })
      if (!res.ok) throw new Error('No se pudo guardar el guión editado')
      setError(null)
      return true
    } catch (err) {
      dirty.current = true // no se guardó: que el próximo blur lo reintente
      setError((err as Error).message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function start() {
    if (!sessionId || running) return
    // Backstop: si el último campo sigue enfocado, su blur no corrió. Y si el guardado
    // falla, NO se renderiza — el render leería el guión viejo del servidor y el usuario
    // pagaría por un video que no es el que está viendo en pantalla.
    if (!(await saveScript())) return
    setError(null); setProgress(0)
    patch({ videoUrl: null })
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/generate-video`, { method: 'POST' })
      const data = (await res.json()) as { taskId?: string; regensLeft?: number | null; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo iniciar el render')
      // El contador solo se hidrata al montar el wizard, así que sin esto el botón
      // seguiría diciendo "2 restantes" después de gastar los dos.
      if (typeof data.regensLeft === 'number')
        setRegens({ ...regens, 'video-render': data.regensLeft })
      patch({ videoStatus: 'waiting' })
      setRunning(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (videoUrl) {
    const left = regens['video-render']
    // Si la copia al bucket falló, esto es una URL de KIE y el parámetro no hace nada:
    // el video se abre en vez de descargarse. Degradado aceptable, no roto.
    const downloadHref = `${videoUrl}${videoUrl.includes('?') ? '&' : '?'}download=video-ad.mp4`
    return (
      <div className="flex flex-col gap-4">
        <video src={videoUrl} controls playsInline className="max-h-[70vh] w-full rounded-2xl border border-white/[0.08] bg-black object-contain" />
        {/* `download` a secas no sirve: el mp4 es cross-origin (bucket de Supabase) y el
            browser ignora el atributo, así que abría el video en otra pestaña. Supabase
            responde `content-disposition: attachment` si se le pide con ?download=, que
            sí fuerza el guardado. Y sin target="_blank": con attachment, la pestaña
            nueva parpadea y se cierra sola. */}
        <a href={downloadHref} download className={btnPrimary}>
          <Download className="h-4 w-4" strokeWidth={1.8} />Descargar video
        </a>
        {error && <div className={errorBox}>{error}</div>}
        <button onClick={start} disabled={left === 0} className={btnGhost}>
          {left === 0
            ? 'Sin regeneraciones disponibles'
            : left // sin fila previa el mapa no trae el kind: mejor sin número que "undefined"
              ? `Generar otra versión (${left} ${left === 1 ? 'restante' : 'restantes'})`
              : 'Generar otra versión'}
        </button>
        <BackToDashboard className="w-full" />
      </div>
    )
  }

  if (running) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-10">
        <span className={spinner} />
        <span className="text-[13px] font-semibold text-[#ededed]">{LABEL[videoStatus ?? 'waiting'] ?? 'Procesando'}</span>
        <span className="text-[12px] text-[#8b8b8b]">
          {progress > 0 ? `${progress}%` : 'Esto toma unos minutos. Puedes dejar la pestaña abierta.'}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {confirmedScript && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#121214] px-4 py-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
            Guión elegido — versión {confirmedScript.version}
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-[#8b8b8b]">
            Última pasada antes de gastar el render: corrige lo que suene raro. Lo de arriba
            es lo que se <strong className="font-semibold text-[#cfcfcf]">dice en voz alta</strong>;
            lo de abajo, el texto sobreimpreso.
          </p>
          <ol className="flex flex-col gap-3">
            {confirmedScript.beats.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2.5 shrink-0 font-mono text-[11px] text-[#8b8b8b]">{b.t}</span>
                <span className="flex flex-1 flex-col gap-1.5">
                  <textarea
                    value={b.dialogue}
                    onChange={(e) => editBeat(i, 'dialogue', e.target.value)}
                    onBlur={saveScript}
                    rows={2}
                    placeholder="(sin diálogo en este tramo)"
                    aria-label={`Diálogo del tramo ${b.t}`}
                    className="jr-field w-full resize-y rounded-lg px-3 py-2 text-[13px] leading-relaxed"
                  />
                  <input
                    value={b.onScreenText}
                    onChange={(e) => editBeat(i, 'onScreenText', e.target.value)}
                    onBlur={saveScript}
                    placeholder="Texto en pantalla (opcional)"
                    aria-label={`Texto en pantalla del tramo ${b.t}`}
                    className="jr-field h-9 w-full rounded-lg px-3 text-[11px] uppercase tracking-wide text-[#ff9b4a]"
                  />
                  <span className="text-[11px] leading-relaxed text-[#8b8b8b]">{b.action}</span>
                </span>
              </li>
            ))}
          </ol>
          {saving && <div className="mt-2 text-[11px] text-[#8b8b8b]">Guardando…</div>}
        </div>
      )}
      {error && <div className={errorBox}>{error}</div>}
      <button onClick={start} disabled={saving} className={btnPrimary}>Generar el video →</button>
    </div>
  )
}
