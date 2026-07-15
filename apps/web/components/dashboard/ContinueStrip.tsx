'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, ImageOff } from 'lucide-react'
import { Eyebrow } from '@/components/ui/Eyebrow'

// Tools con sesiones persistidas (GET /api/<slug>/sessions → shape uniforme).
const SESSION_TOOLS = [
  { slug: 'generador-anuncios', name: 'Generador de Anuncios' },
  { slug: 'generador-branding', name: 'Generador de Branding' },
  { slug: 'generador-landing', name: 'Generador de Landing' },
  { slug: 'calculadora-costos', name: 'Calculadora de Costos' },
] as const

interface Recent {
  slug: string
  toolName: string
  id: string
  created_at: string
  title: string
  thumb: string | null
  done: boolean
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })

/**
 * "Retoma tu trabajo": agrega las sesiones recientes de las 4 tools generativas
 * y muestra las últimas. Solo lecturas a endpoints existentes ($0, sin LLM).
 * Best-effort: si no hay sesiones, no renderiza nada.
 */
export function ContinueStrip() {
  const [items, setItems] = useState<Recent[] | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all(
      SESSION_TOOLS.map((t) =>
        fetch(`/api/${t.slug}/sessions`)
          .then((r) => (r.ok ? r.json() : { sessions: [] }))
          .then((d) =>
            (d.sessions ?? []).map((s: Omit<Recent, 'slug' | 'toolName'>) => ({
              ...s,
              slug: t.slug,
              toolName: t.name,
            })),
          )
          .catch(() => [] as Recent[]),
      ),
    ).then((lists) => {
      if (!alive) return
      const merged = (lists.flat() as Recent[])
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 4)
      setItems(merged)
    })
    return () => {
      alive = false
    }
  }, [])

  // Sin sesiones (o aún cargando la primera vez): no ocupamos espacio.
  if (!items || items.length === 0) return null

  return (
    <section className="mb-12">
      <Eyebrow label="Retoma tu trabajo" className="mb-4" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((s) => (
          <Link
            key={`${s.slug}-${s.id}`}
            href={`/tools/${s.slug}/sesion/${s.id}`}
            className="jr-card group flex items-center gap-3 overflow-hidden rounded-2xl p-3 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,240,220,0.14)]"
          >
            <div className="jr-inset flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl">
              {s.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageOff className="h-5 w-5 text-[#544e45]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.5px] text-[#ff9c4d]">
                {s.toolName}
              </p>
              <h3 className="truncate text-[13px] font-semibold text-[#f3efe8]">{s.title}</h3>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#726b60]">
                {s.done ? (
                  <CheckCircle2 className="h-3 w-3 text-[#4cd07d]" />
                ) : (
                  <Clock className="h-3 w-3 text-[#ff9c4d]" />
                )}
                <span className="readout">{fmtDate(s.created_at)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
