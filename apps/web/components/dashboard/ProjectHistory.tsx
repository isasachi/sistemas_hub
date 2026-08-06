'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, ArrowUpDown, Trash2 } from 'lucide-react'
import { tools, getToolBySlug } from '@/lib/tools'
import { toolIcon } from '@/lib/tool-icons'
import { LandingToolCard } from '@/components/home/LandingToolCard'

// Tools con sesiones persistidas (GET /api/<slug>/sessions → shape uniforme).
// El label corto alimenta los chips de filtro. buscador-productos NO produce
// filas de proyecto (usa ph_*), por eso no está aquí ni aparece en el historial.
const SESSION_TOOLS = [
  { slug: 'generador-anuncios', name: 'Generador de Anuncios', short: 'Anuncios' },
  { slug: 'generador-branding', name: 'Generador de Branding', short: 'Branding' },
  { slug: 'generador-landing', name: 'Generador de Landing', short: 'Landing' },
  { slug: 'calculadora-costos', name: 'Calculadora de Costos', short: 'Costos' },
] as const

interface Project {
  slug: string
  toolName: string
  id: string
  created_at: string
  title: string
  thumb: string | null
  done: boolean
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Historial de proyectos a pantalla completa: agrega las sesiones de las 4 tools
 * generativas (fan-out a sus endpoints, shape uniforme), las mergea y las muestra
 * en un tablero masonry ordenado (default reciente→antiguo) con filtro por tool.
 * Solo lecturas a endpoints existentes ($0, sin LLM).
 */
export function ProjectHistory() {
  const [items, setItems] = useState<Project[] | null>(null)
  const [sort, setSort] = useState<'recent' | 'old'>('recent')
  const [filter, setFilter] = useState<'all' | string>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  // El borrado vivía en el grid de sesiones de cada tool; al retirarse esa
  // pantalla, el historial del dashboard pasó a ser el único lugar donde el
  // usuario puede deshacerse de un proyecto.
  async function remove(p: Project) {
    const key = `${p.slug}-${p.id}`
    if (deleting) return
    if (!confirm(`¿Eliminar "${p.title}"? No se puede deshacer.`)) return
    setDeleting(key)
    try {
      const res = await fetch(`/api/${p.slug}/sessions/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      setItems((prev) => prev?.filter((x) => !(x.slug === p.slug && x.id === p.id)) ?? null)
    } catch {
      alert('No se pudo eliminar el proyecto. Inténtalo de nuevo.')
    } finally {
      setDeleting(null)
    }
  }

  useEffect(() => {
    let alive = true
    // ponytail: cada endpoint capa a .limit(24) en su db.ts → ~96 items techo total.
    // Suficiente para la realidad actual (pocos usuarios demo); subir el limit si las cuentas se llenan.
    Promise.all(
      SESSION_TOOLS.map((t) =>
        fetch(`/api/${t.slug}/sessions`)
          .then((r) => (r.ok ? r.json() : { sessions: [] }))
          .then((d) =>
            (d.sessions ?? []).map((s: Omit<Project, 'slug' | 'toolName'>) => ({
              ...s,
              slug: t.slug,
              toolName: t.name,
            })),
          )
          .catch(() => [] as Project[]),
      ),
    ).then((lists) => {
      if (alive) setItems(lists.flat() as Project[])
    })
    return () => {
      alive = false
    }
  }, [])

  const shown = useMemo(() => {
    let list = items ?? []
    if (filter !== 'all') list = list.filter((i) => i.slug === filter)
    return [...list].sort((a, b) =>
      sort === 'recent'
        ? +new Date(b.created_at) - +new Date(a.created_at)
        : +new Date(a.created_at) - +new Date(b.created_at),
    )
  }, [items, filter, sort])

  // Cargando la primera vez → skeletons.
  if (items === null) {
    return (
      <div className="columns-2 gap-3.5 sm:columns-3 lg:columns-5 xl:columns-6">
        {[220, 300, 180, 260, 240, 200, 280, 210].map((h, i) => (
          <div
            key={i}
            className="jr-card mb-4 animate-pulse rounded-2xl opacity-40"
            style={{ height: h }}
          />
        ))}
      </div>
    )
  }

  // Cuenta sin proyectos → empty state que surtidor de tools (arranca de cero).
  if (items.length === 0) {
    return (
      <div>
        <div className="mb-8 max-w-[560px]">
          <h2 className="lp-serif text-[22px] text-[#ededed]">Aún no tienes proyectos</h2>
          <p className="mt-2 font-[Lato] text-[14px] text-[#bebebe]">
            Elige una herramienta para crear tu primer proyecto. Aparecerá aquí en cuanto empieces.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools
            .filter((t) => t.status === 'live')
            .map((tool) => (
              <LandingToolCard key={tool.slug} tool={tool} />
            ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Controles: orden + filtro por tool */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSort((s) => (s === 'recent' ? 'old' : 'recent'))}
          className="mr-1 inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 font-[Poppins] text-[12px] font-medium text-[#cfcfcf] transition-colors duration-200 hover:text-[#ffffff] cursor-pointer"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sort === 'recent' ? 'Más reciente' : 'Más antiguo'}
        </button>

        <div className="h-4 w-px bg-white/[0.1]" />

        <FilterChip label="Todos" active={filter === 'all'} onClick={() => setFilter('all')} />
        {SESSION_TOOLS.map((t) => (
          <FilterChip
            key={t.slug}
            label={t.short}
            active={filter === t.slug}
            onClick={() => setFilter(t.slug)}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="font-[Lato] text-[13px] text-[#bebebe]">
          No tienes proyectos de esta herramienta todavía.
        </p>
      ) : (
        <div className="columns-2 gap-3.5 sm:columns-3 lg:columns-5 xl:columns-6">
          {shown.map((p) => (
            <ProjectCard
              key={`${p.slug}-${p.id}`}
              p={p}
              onDelete={() => remove(p)}
              deleting={deleting === `${p.slug}-${p.id}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1.5 font-[Poppins] text-[12px] font-medium transition-colors duration-200 cursor-pointer',
        active
          ? 'bg-[rgba(255,106,0,0.14)] text-[rgb(255,155,74)]'
          : 'border border-white/[0.08] bg-white/[0.02] text-[#bebebe] hover:text-[#ffffff]',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function ProjectCard({
  p,
  onDelete,
  deleting,
}: {
  p: Project
  onDelete: () => void
  deleting: boolean
}) {
  const Icon = toolIcon(getToolBySlug(p.slug)?.icon ?? '')
  return (
    <Link
      href={`/tools/${p.slug}/sesion/${p.id}`}
      className="lp-card lp-leak group relative mb-3.5 block break-inside-avoid overflow-hidden no-underline transition-transform duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,255,255,0.2)]"
    >
      <button
        type="button"
        title="Eliminar proyecto"
        aria-label={`Eliminar ${p.title}`}
        disabled={deleting}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDelete()
        }}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-black/50 text-[#cfcfcf] opacity-0 backdrop-blur transition-opacity duration-200 hover:text-[#e93d3d] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40 cursor-pointer"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {p.thumb ? (
        // Miniatura completa a altura natural (sin recorte) para la estética masonry.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.thumb} alt="" className="relative z-[1] block h-auto w-full" />
      ) : (
        // Sin miniatura (calculadora / sesión a medio wizard): tile de datos, no un hueco.
        <div className="relative z-[1] flex aspect-[4/3] items-center justify-center border-b border-white/[0.06] bg-white/[0.02]">
          <Icon className="h-9 w-9 text-[#6a6a6a]" />
        </div>
      )}
      <div className="relative z-[1] p-2.5">
        <p className="truncate font-[Poppins] text-[9px] font-semibold uppercase tracking-[0.12em] text-[#d6a860]">
          {p.toolName}
        </p>
        <h3 className="mt-0.5 truncate text-[12.5px] font-semibold text-[#ededed]">{p.title}</h3>
        <div className="mt-1 flex items-center gap-1.5 font-[Lato] text-[10.5px] text-[#cfcfcf]">
          {p.done ? (
            <CheckCircle2 className="h-3 w-3 text-[#2ccf6f]" />
          ) : (
            <Clock className="h-3 w-3 text-[rgb(255,155,74)]" />
          )}
          <span>{fmtDate(p.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}
