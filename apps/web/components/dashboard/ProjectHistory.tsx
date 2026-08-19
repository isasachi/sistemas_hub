'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, ArrowUpDown, Trash2, FolderOpen } from 'lucide-react'
import { getToolBySlug } from '@/lib/tools'
import { toolIcon } from '@/lib/tool-icons'

// Tools con sesiones persistidas (GET /api/<slug>/sessions → shape uniforme).
// El label corto alimenta los chips de filtro. buscador-productos NO produce
// filas de proyecto (usa ph_*), por eso no está aquí ni aparece en el historial.
const SESSION_TOOLS = [
  { slug: 'generador-anuncios', name: 'Generador de Anuncios', short: 'Anuncios' },
  { slug: 'generador-branding', name: 'Generador de Branding', short: 'Branding' },
  { slug: 'generador-landing', name: 'Generador de Landing', short: 'Landing' },
  { slug: 'generador-video-ads', name: 'Generador de Video Ads', short: 'Video' },
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
 * Historial de proyectos a pantalla completa: agrega las sesiones de las 5 tools
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

  // Cuenta sin proyectos → placeholder centrado. El grid vacío no dice nada;
  // esto sí dice qué va a aparecer acá y de dónde sale.
  if (items.length === 0) return <EmptyState />

  return (
    <div>
      {/* Controles: orden + filtro por tool */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSort((s) => (s === 'recent' ? 'old' : 'recent'))}
          className="mr-1 inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 font-[Archivo] text-[12px] font-medium text-[#c9b4ae] transition-colors duration-200 hover:text-[#f6f2eb] cursor-pointer"
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
        <EmptyState filtered />
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

/**
 * Placeholder del grid: un ícono, una frase y nada más. Centrado en la zona
 * donde irían las cards para que el vacío se lea como "todavía no", no como
 * "algo falló".
 */
function EmptyState({ filtered = false }: { filtered?: boolean }) {
  return (
    <div className="flex min-h-[58vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-[rgba(246,242,235,0.25)] bg-[rgba(246,242,235,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <FolderOpen className="h-9 w-9 text-[#e8dcd6]" strokeWidth={1.5} />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{
            background:
              'radial-gradient(120% 100% at 50% 0%, rgba(246,242,235,0.18), rgba(0,0,0,0) 60%)',
          }}
        />
      </div>
      <h2 className="lp-serif text-[20px] text-[#efe7e0]">
        {filtered ? 'Nada de esta herramienta todavía' : 'Aquí aparece todo lo que generes'}
      </h2>
      <p className="mt-2.5 max-w-[420px] font-[Archivo] text-[14px] leading-[1.6] text-[#a98c88]">
        {filtered
          ? 'Todavía no has usado esta herramienta. Ábrela desde la barra de arriba y tu primer proyecto aparecerá aquí.'
          : 'Cada anuncio, video, marca, landing y cálculo que generes queda guardado en este tablero. Elige una herramienta de la barra de arriba para empezar.'}
      </p>
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
        'rounded-full px-3 py-1.5 font-[Archivo] text-[12px] font-medium transition-colors duration-200 cursor-pointer',
        active
          ? 'bg-[rgba(189,19,71,0.14)] text-[rgb(232,70,122)]'
          : 'border border-white/[0.08] bg-white/[0.02] text-[#a98c88] hover:text-[#f6f2eb]',
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
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-black/50 text-[#c9b4ae] opacity-0 backdrop-blur transition-opacity duration-200 hover:text-[#ff5a3c] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40 cursor-pointer"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {p.thumb && p.thumb.includes('.mp4') ? (
        // El generador de video manda el mp4 como miniatura: el browser pinta su primer
        // frame. No es un póster generado — no hay ffmpeg acá y no vale uno por esto.
        // `preload="metadata"` es obligatorio: sin metadata el elemento mide 0 de alto y
        // el masonry salta cuando cada card termina de cargar. El wrapper 9:16 reserva
        // el hueco desde el primer render (todo lo que sale de esta tool es 9:16).
        <div className="relative z-[1] aspect-[9/16] w-full overflow-hidden bg-black">
          <video
            // `#t=0.1` pide el frame de los 0.1s: muchos mp4 abren en negro, y con el
            // frame 0 la card se vería vacía.
            src={`${p.thumb}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            className="block h-full w-full object-cover"
          />
        </div>
      ) : p.thumb ? (
        // Miniatura completa a altura natural (sin recorte) para la estética masonry.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.thumb} alt="" className="relative z-[1] block h-auto w-full" />
      ) : (
        // Sin miniatura (calculadora / sesión a medio wizard): tile de datos, no un hueco.
        <div className="relative z-[1] flex aspect-[4/3] items-center justify-center border-b border-white/[0.06] bg-white/[0.02]">
          <Icon className="h-9 w-9 text-[#967b76]" />
        </div>
      )}
      <div className="relative z-[1] p-2.5">
        <p className="truncate font-[Archivo] text-[9px] font-semibold uppercase tracking-[0.12em] text-[#e8dcd6]">
          {p.toolName}
        </p>
        <h3 className="mt-0.5 truncate text-[12.5px] font-semibold text-[#efe7e0]">{p.title}</h3>
        <div className="mt-1 flex items-center gap-1.5 font-[Archivo] text-[10.5px] text-[#c9b4ae]">
          {p.done ? (
            <CheckCircle2 className="h-3 w-3 text-[#3ed88a]" />
          ) : (
            <Clock className="h-3 w-3 text-[rgb(232,70,122)]" />
          )}
          <span>{fmtDate(p.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}
