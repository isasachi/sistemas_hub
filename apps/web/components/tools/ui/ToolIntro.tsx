'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Clock, ImageIcon } from 'lucide-react'
import ToolShell from './ToolShell'
import type { HistoryItem } from './types'

/**
 * Pantalla de entrada de una tool: propuesta de valor y un CTA.
 * ---------------------------------------------------------------------------
 * Reemplaza al grid de sesiones que había antes. El historial completo vive en
 * el dashboard (ProjectHistory), que ya lista las sesiones de las 4 tools — acá
 * solo se ofrece lo único que sirve al abrir la tool: empezar, o retomar lo que
 * quedó a medias. Mismo patrón que la entrada del generador de branding.
 */
export default function ToolIntro({
  name,
  slug,
  title,
  description,
  cta,
  /** Clave de localStorage a limpiar al empezar de cero, para que el asistente
   *  cree una sesión nueva en vez de reanudar la última. */
  sessionKey,
}: {
  name: string
  slug: string
  title: string
  description: string
  cta: string
  sessionKey?: string
}) {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/${slug}/sessions`)
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d) => { if (!cancelled) setItems(d.sessions ?? []) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [slug])

  // Lo primero que devuelve la API es lo más reciente.
  const enProgreso = items?.find((s) => !s.done) ?? null
  const ultima = items?.find((s) => s.done) ?? null

  function empezar() {
    if (sessionKey) localStorage.removeItem(sessionKey)
    router.push(`/tools/${slug}/wizard`)
  }

  return (
    <ToolShell name={name}>
      <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-8 px-5 pb-16 pt-12 md:px-8">
        <div className="jr-rise flex max-w-[640px] flex-col gap-4">
          <h1 className="lp-serif text-[clamp(28px,3.8vw,38px)] leading-[1.15] text-[#ffffff]">
            {title}
          </h1>
          <p className="font-[Lato] text-[15px] leading-[1.65] text-[#cfcfcf]">{description}</p>
        </div>

        <button type="button" onClick={empezar} className="jr-cta h-13 self-start rounded-xl px-8 py-4 text-[15px] cursor-pointer">
          {enProgreso ? `Empezar de nuevo` : cta}
          <ArrowRight className="h-4 w-4" />
        </button>

        {/* Retomar: solo si de verdad hay algo a medias. */}
        {enProgreso && (
          <div className="jr-card lp-leak flex flex-col gap-3 rounded-2xl p-5">
            <p className="relative font-sans text-[14px] font-semibold text-[#ffffff]">
              Tienes algo a medias
            </p>
            <p className="relative text-[13px] text-[#cfcfcf]">
              {enProgreso.title} — quedaste en el paso {enProgreso.step + 1}.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/tools/${slug}/sesion/${enProgreso.id}`)}
              className="jr-btn-secondary relative h-11 w-fit rounded-xl px-5 text-[13px] cursor-pointer"
            >
              <Clock className="h-4 w-4" /> Retomar
            </button>
          </div>
        )}

        {ultima && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="min-w-[220px] flex-1 text-[13px] text-[#cfcfcf]">
              Tu último resultado sigue disponible.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/tools/${slug}/sesion/${ultima.id}`)}
              className="jr-btn-ghost h-11 rounded-xl px-5 text-[13px] cursor-pointer"
            >
              <ImageIcon className="h-4 w-4" /> Ver el último
            </button>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
