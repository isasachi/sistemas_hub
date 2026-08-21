'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Clock, ImageIcon } from 'lucide-react'
import ToolShell from './ToolShell'
import { pickIntroState, type HistoryItem } from './types'

/**
 * Vista inicial de una tool — la misma para todas, en este orden:
 *
 *   1. tu última sesión terminada, para volver a verla;
 *   2. el botón de empezar una sesión nueva;
 *   3. "tienes algo a medias", solo si la última pasó del paso 1 sin terminarse
 *      (ver `pickIntroState`), y lleva DERECHO al wizard — no a la vista de
 *      solo lectura de la sesión, que obligaba a un clic de más.
 *
 * El historial completo vive en el dashboard (ProjectHistory); acá solo va lo
 * que sirve al abrir la tool.
 */

/** Aviso ya resuelto por la tool. Branding lo arma de localStorage, no de la API. */
export interface IntroAction {
  detail: string
  onClick: () => void
}

/**
 * Bifurcación de entrada: una tool que hace DOS cosas distintas pregunta cuál antes de
 * empezar, en vez de meter la elección adentro como un primer paso. Si se pasa `choices`,
 * las cards reemplazan al botón único de `cta`.
 */
export interface IntroChoice {
  title: string
  description: string
  cta: string
  href: string
}

export default function ToolIntro({
  name,
  slug,
  title,
  description,
  cta,
  /** Clave de localStorage del id de sesión: con ella se empieza en blanco y se retoma. */
  sessionKey,
  /** Avisos ya resueltos. Si se pasa, no se consulta /api/<slug>/sessions. */
  state,
  /** Reemplaza el arranque por defecto (branding no tiene /wizard sino /nuevo). */
  onStart,
  /** Pregunta + cards en lugar del botón único. */
  question,
  choices,
}: {
  name: string
  slug: string
  title: string
  description: string
  cta: string
  sessionKey?: string
  state?: { last: IntroAction | null; resume: IntroAction | null }
  onStart?: () => void
  question?: string
  choices?: IntroChoice[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[] | null>(null)

  useEffect(() => {
    if (state) return
    let cancelled = false
    fetch(`/api/${slug}/sessions`)
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d) => { if (!cancelled) setItems(d.sessions ?? []) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [slug, state])

  const { last, resume } = pickIntroState(items)

  // El wizard se hidrata del id guardado en localStorage — mismo gesto que hace
  // "Reanudar sesión" en la vista de la sesión.
  const avisos = state ?? {
    last: last
      ? { detail: 'Tu último resultado sigue disponible.', onClick: () => router.push(`/tools/${slug}/sesion/${last.id}`) }
      : null,
    resume: resume
      ? {
          detail: `${resume.title} — quedaste en el paso ${resume.step + 1}.`,
          onClick: () => {
            if (sessionKey) localStorage.setItem(sessionKey, resume.id)
            router.push(`/tools/${slug}/wizard`)
          },
        }
      : null,
  }

  function empezar() {
    if (onStart) return onStart()
    if (sessionKey) localStorage.removeItem(sessionKey)
    router.push(`/tools/${slug}/wizard`)
  }

  return (
    <ToolShell name={name}>
      <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-8 px-5 pb-16 pt-12 md:px-8">
        <div className="jr-rise flex max-w-[640px] flex-col gap-4">
          <h1 className="lp-serif text-[clamp(28px,3.8vw,38px)] leading-[1.15] text-[#f6f2eb]">
            {title}
          </h1>
          <p className="font-[Lato] text-[15px] leading-[1.65] text-[#c9b4ae]">{description}</p>
        </div>

        {/* 1 — lo terminado. */}
        {avisos.last && (
          <div data-intro="last" className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="min-w-[220px] flex-1 text-[13px] text-[#c9b4ae]">{avisos.last.detail}</p>
            <button type="button" onClick={avisos.last.onClick}
                    className="jr-btn-ghost h-11 rounded-xl px-5 text-[13px] cursor-pointer">
              <ImageIcon className="h-4 w-4" /> Ver el último
            </button>
          </div>
        )}

        {/* 2 — empezar de cero: un botón, o la bifurcación en cards. */}
        {choices?.length ? (
          <div data-intro="choices" className="flex flex-col gap-4">
            {question && (
              <h2 className="font-sans text-[17px] font-semibold text-[#f6f2eb]">{question}</h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {choices.map((c) => (
                <div key={c.href} className="jr-card lp-leak flex flex-col gap-3 rounded-2xl p-5">
                  <p className="relative font-sans text-[15px] font-semibold text-[#f6f2eb]">{c.title}</p>
                  <p className="relative flex-1 text-[13px] leading-relaxed text-[#c9b4ae]">{c.description}</p>
                  <Link href={c.href} className="jr-cta relative h-11 w-fit rounded-xl px-5 text-[13px] no-underline">
                    {c.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" data-intro="start" onClick={empezar}
                  className="jr-cta h-13 self-start rounded-xl px-8 py-4 text-[15px] cursor-pointer">
            {cta}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

        {/* 3 — lo que quedó a medias. */}
        {avisos.resume && (
          <div data-intro="resume" className="jr-card lp-leak flex flex-col gap-3 rounded-2xl p-5">
            <p className="relative font-sans text-[14px] font-semibold text-[#f6f2eb]">
              Tienes algo a medias
            </p>
            <p className="relative text-[13px] text-[#c9b4ae]">{avisos.resume.detail}</p>
            <button type="button" onClick={avisos.resume.onClick}
                    className="jr-btn-secondary relative h-11 w-fit rounded-xl px-5 text-[13px] cursor-pointer">
              <Clock className="h-4 w-4" /> Retomar
            </button>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
