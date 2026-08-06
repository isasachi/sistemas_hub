'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, LayoutTemplate, RefreshCw, Sparkles } from 'lucide-react'
import { readSSEStream } from '@/components/tools/ui/SSEStatus'
import { btnPrimary } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, clearBrief } from '@/lib/branding/brief'
import { SESSION_KEY as LANDING_SESSION_KEY } from '@/store/landing'
import { STAGE_LABELS, type Stage } from '@/lib/branding/generation'

interface SessionRow {
  logo_url: string | null
  mockup_url: string | null
  label_url: string | null
  brand_name: string | null
  generation_status: string | null
}

function Artifact({ stage, url, busy, onRegen, big }: {
  stage: Stage; url: string | null; busy: boolean; onRegen: () => void; big?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`relative rounded-2xl border border-white/[0.08] overflow-hidden bg-white ${big ? 'aspect-[4/5]' : 'aspect-square'}`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase con cache-bust
          <img src={url} alt={STAGE_LABELS[stage]} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#0f0f0f] text-[12px] text-[#8a8a8a] px-4 text-center">
            No salió. Puedes reintentar solo esta pieza.
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="w-7 h-7 border-2 border-white/20 border-t-[#ff9c4d] rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#f5f5f5]">{STAGE_LABELS[stage]}</span>
        <button type="button" onClick={onRegen} disabled={busy}
                className="h-8 px-2.5 rounded-lg text-[11px] text-[#bdbdbd] hover:text-[#f5f5f5] bg-transparent border border-white/[0.1] cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" /> Regenerar
        </button>
      </div>
    </div>
  )
}

function Resultado() {
  const router = useRouter()
  const sessionId = useSearchParams().get('s')
  const [row, setRow] = useState<SessionRow | null>(null)
  const [busy, setBusy] = useState<Stage | null>(null)
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

  async function regen(stage: Stage) {
    if (!sessionId || busy) return
    setBusy(stage); setError(null)
    try {
      const res = await fetch('/api/generador-branding/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, only: stage }),
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
      router.push('/tools/generador-landing')
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
        <Link href="/tools/generador-branding" className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/[0.1] text-[13px] font-semibold text-[#f5f5f5] no-underline hover:bg-white/[0.05] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Generador de branding
        </Link>
      </div>

      <div className="flex-1 w-full max-w-[880px] mx-auto px-6 pb-12 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold text-[#f5f5f5] leading-tight">
            La marca de {row?.brand_name ?? '...'} está lista
          </h1>
          <p className="text-[13px] text-[#bdbdbd]">
            {row?.generation_status === 'running'
              ? 'Todavía se está generando alguna pieza...'
              : 'Regenera la pieza que no te convenza; el resto queda igual.'}
          </p>
        </div>

        <Artifact stage="mockup" url={row?.mockup_url ?? null} busy={busy === 'mockup'} onRegen={() => regen('mockup')} big />

        <div className="grid sm:grid-cols-2 gap-4">
          <Artifact stage="logo" url={row?.logo_url ?? null} busy={busy === 'logo'} onRegen={() => regen('logo')} />
          <Artifact stage="label" url={row?.label_url ?? null} busy={busy === 'label'} onRegen={() => regen('label')} />
        </div>

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
                  className="h-12 px-6 rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#f5f5f5] hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent disabled:opacity-40 flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" />
            {landing ? 'Creando...' : 'Crear la landing con esta marca'}
          </button>
          <button type="button" onClick={() => router.push(STEPS[4].path)}
                  className="h-12 px-6 rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#f5f5f5] hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent">
            Cambiar estilo
          </button>
          <button type="button" onClick={otraMarca}
                  className="h-12 px-6 rounded-xl text-[13px] font-semibold text-[#bdbdbd] hover:text-[#f5f5f5] transition-colors cursor-pointer bg-transparent border-0 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Crear otra marca
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ResultadoPage() {
  return <Suspense fallback={null}><Resultado /></Suspense>
}
