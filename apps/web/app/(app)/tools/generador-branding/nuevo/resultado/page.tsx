'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, LayoutTemplate, RefreshCw, Sparkles } from 'lucide-react'
import { readSSEStream } from '@/components/tools/ui/SSEStatus'
import BackToDashboard from '@/components/tools/ui/BackToDashboard'
import { btnPrimary } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, clearBrief } from '@/lib/branding/brief'
import { SESSION_KEY as LANDING_SESSION_KEY } from '@/store/landing'
import { STAGE_LABELS, type Stage } from '@/lib/branding/generation'

interface SessionRow {
  logo_url: string | null
  mockup_url: string | null
  label_url: string | null
  container_url: string | null
  brand_name: string | null
  generation_status: string | null
}

function Artifact({ stage, url, busy, onRegen, big, wide, tall, regenLabel }: {
  stage: Stage; url: string | null; busy: boolean; onRegen: () => void
  big?: boolean; wide?: boolean; tall?: boolean; regenLabel?: string
}) {
  const ratio = big || wide ? 'aspect-[3/2]' : tall ? 'aspect-[4/5]' : 'aspect-square'
  return (
    <div className="flex flex-col gap-2">
      <div className={`relative rounded-2xl border border-white/[0.08] overflow-hidden bg-white ${ratio}`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase con cache-bust
          <img src={url} alt={STAGE_LABELS[stage]} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#0c0c0d] text-[12px] text-[#bebebe] px-4 text-center">
            No salió. Puedes reintentar solo esta pieza.
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="w-7 h-7 border-2 border-white/20 border-t-[#ff9b4a] rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#ededed]">{STAGE_LABELS[stage]}</span>
        <button type="button" onClick={onRegen} disabled={busy}
                className="h-8 px-2.5 rounded-lg text-[11px] text-[#cfcfcf] hover:text-[#ededed] bg-transparent border border-white/[0.1] cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" /> {regenLabel ?? 'Regenerar'}
        </button>
      </div>
    </div>
  )
}

function Resultado() {
  const router = useRouter()
  const sessionId = useSearchParams().get('s')
  const [row, setRow] = useState<SessionRow | null>(null)
  const [busy, setBusy] = useState<Stage | 'todo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [landing, setLanding] = useState(false)

  const load = useCallback(async () => {
    if (!sessionId) return
    const res = await fetch(`/api/generador-branding/sessions/${sessionId}`)
    if (res.ok) setRow((await res.json()) as SessionRow)
  }, [sessionId])

  useEffect(() => { load() }, [load])

  // Mientras la corrida sigue viva (se llegó acá con "seguir en segundo plano"),
  // se relee la sesión hasta que el estado deje de ser 'running'.
  useEffect(() => {
    if (row?.generation_status !== 'running') return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [row?.generation_status, load])

  /**
   * Regenerar la IDENTIDAD regenera las tres piezas: se derivan de ella, así que
   * una identidad nueva deja a las otras siendo otra marca. Es más caro (4
   * imágenes), pero entregar un kit con piezas de dos marcas no es una opción.
   */
  async function regen(stage: Stage) {
    if (!sessionId || busy) return
    const todo = stage === 'identidad'
    setBusy(todo ? 'todo' : stage); setError(null)
    try {
      const res = await fetch('/api/generador-branding/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(todo ? { sessionId } : { sessionId, only: stage }),
      })
      await readSSEStream(res, (e) => {
        const ev = e as unknown as { status: string; message?: string }
        if (ev.status === 'stage_failed' || ev.status === 'error') setError(ev.message ?? 'Falló la regeneración')
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  // Handoff a landing: la ruta pre-llena una sesión con la marca y el wizard la
  // levanta desde localStorage (mismo contrato que usaba la guía del flujo viejo).
  async function crearLanding() {
    if (!sessionId || landing) return
    setLanding(true); setError(null)
    try {
      const res = await fetch('/api/generador-landing/from-branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandingSessionId: sessionId }),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) throw new Error(data.error ?? 'No se pudo crear la landing')
      localStorage.setItem(LANDING_SESSION_KEY, data.id)
      // DERECHO al wizard, no a la vista inicial de la tool. Hasta la vista inicial única (PR #49)
      // `/tools/generador-landing` ERA el wizard; desde entonces es un ToolIntro, así que el
      // handoff dejaba al usuario en una pantalla de "continuar sesión" en vez de seguir el flujo.
      // Mismo gesto que hace ToolIntro al retomar: id en localStorage + push a /wizard.
      router.push('/tools/generador-landing/wizard')
    } catch (err) {
      setError((err as Error).message)
      setLanding(false)
    }
  }

  // Culminar: el brief se borra (la marca ya está guardada en su sesión) y se
  // arranca uno limpio. Sin esto, volver a la tool solo ofrecía retomar la misma.
  function otraMarca() {
    clearBrief()
    router.push(STEPS[0].path)
  }

  if (!sessionId) return null

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-6 py-4">
        <Link href="/tools/generador-branding" className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/[0.1] text-[13px] font-semibold text-[#ededed] no-underline hover:bg-white/[0.05] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Generador de branding
        </Link>
      </div>

      <div className="flex-1 w-full max-w-[880px] mx-auto px-6 pb-12 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold text-[#ededed] leading-tight">
            La marca de {row?.brand_name ?? '...'} está lista
          </h1>
          <p className="text-[13px] text-[#cfcfcf]">
            {row?.generation_status === 'running'
              ? 'Todavía se está generando alguna pieza...'
              : 'Regenera la pieza que no te convenza; el resto queda igual.'}
          </p>
        </div>

        {/* Columnas legadas reusadas para no pedir migración: `mockup_url` guarda
            la identidad y `container_url` la foto de producto (ver COLUMN). */}
        <Artifact stage="identidad" url={row?.mockup_url ?? null} busy={busy === 'todo'}
                  onRegen={() => regen('identidad')} big regenLabel="Regenerar la marca entera" />

        <Artifact stage="etiqueta" url={row?.label_url ?? null} busy={busy === 'etiqueta' || busy === 'todo'}
                  onRegen={() => regen('etiqueta')} wide />

        <div className="grid sm:grid-cols-2 gap-4">
          <Artifact stage="logo" url={row?.logo_url ?? null} busy={busy === 'logo' || busy === 'todo'} onRegen={() => regen('logo')} />
          <Artifact stage="mockup" url={row?.container_url ?? null} busy={busy === 'mockup' || busy === 'todo'} onRegen={() => regen('mockup')} tall />
        </div>

        <p className="text-[12px] text-[#bebebe]">
          El kit incluye además el logo en negro y en blanco, derivados del principal.
        </p>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
        )}

        <div className="flex flex-wrap gap-3">
          {/* Jerarquía del spec 6.4: descargar primero, regenerar en cada pieza,
              cambiar estilo al final. La descarga es un <a>: deja que el browser
              maneje el attachment sin pasar el zip por memoria del cliente. */}
          <a href={`/api/generador-branding/sessions/${sessionId}/kit`}
             className={btnPrimary + ' h-12 px-6 no-underline'}>
            <Download className="w-4 h-4" /> Descargar kit
          </a>
          <button type="button" onClick={crearLanding} disabled={landing}
                  className="h-12 px-6 rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#ededed] hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent disabled:opacity-40 flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" />
            {landing ? 'Creando...' : 'Crear la landing con esta marca'}
          </button>
          <button type="button" onClick={() => router.push(STEPS[4].path)}
                  className="h-12 px-6 rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#ededed] hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent">
            Cambiar estilo
          </button>
          <button type="button" onClick={otraMarca}
                  className="h-12 px-6 rounded-xl text-[13px] font-semibold text-[#cfcfcf] hover:text-[#ededed] transition-colors cursor-pointer bg-transparent border-0 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Crear otra marca
          </button>
          <BackToDashboard className="h-12 px-6" />
        </div>
      </div>
    </div>
  )
}

export default function ResultadoPage() {
  return <Suspense fallback={null}><Resultado /></Suspense>
}
