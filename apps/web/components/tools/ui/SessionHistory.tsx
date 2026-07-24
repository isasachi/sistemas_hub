'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, CheckCircle2, Clock, ImageOff, Trash2 } from 'lucide-react'

// Item uniforme que devuelven todos los GET /api/<tool>/sessions.
export interface HistoryItem {
  id: string
  created_at: string
  step: number
  title: string
  thumb: string | null
  done: boolean
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })

// Dashboard de historial reusado por las 4 tools. Fetch al listado propio de cada tool
// (shape uniforme), grid de cards solo-lectura + CTA "Nueva sesión".
// `sessionKey` = clave de localStorage a limpiar antes de arrancar el wizard (para que
// el wizard cree una sesión nueva en vez de reanudar la última). La calculadora no la usa.
export default function SessionHistory({ slug, sessionKey }: { slug: string; sessionKey?: string }) {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/${slug}/sessions`)
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d) => setItems(d.sessions ?? []))
      .catch(() => setItems([]))
  }, [slug])

  function startNew() {
    if (sessionKey) localStorage.removeItem(sessionKey)
    router.push(`/tools/${slug}/wizard`)
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (deletingId) return
    if (!confirm('¿Eliminar esta sesión? No se puede deshacer.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/${slug}/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      setItems((prev) => prev?.filter((x) => x.id !== id) ?? null)
    } catch {
      alert('No se pudo eliminar la sesión')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="h-px w-10 bg-white/[0.12]" />
        <span className="text-[11px] font-bold text-[#8a8a8a] tracking-[2px] uppercase">
          Historial
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {/* CTA Nueva sesión */}
        <button
          onClick={startNew}
          className="group relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(255,156,77,0.35)] bg-[rgba(255,156,77,0.05)] p-6 min-h-[190px] transition-all duration-200 hover:border-[rgba(255,156,77,0.6)] hover:bg-[rgba(255,156,77,0.08)]"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[rgba(255,156,77,0.12)] border border-[rgba(255,156,77,0.25)]">
            <Plus className="w-[22px] h-[22px] text-[#ff9c4d]" />
          </div>
          <span className="text-[15px] font-bold text-[#ff9c4d]">Nueva sesión</span>
          <span className="text-[12px] text-[#8a8a8a]">Empezar de cero</span>
        </button>

        {/* Loading */}
        {items === null &&
          [0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl jr-card p-4 min-h-[190px] animate-pulse opacity-40" />
          ))}

        {/* Cards de sesiones anteriores */}
        {items?.map((s) => (
          <Link
            key={s.id}
            href={`/tools/${slug}/sesion/${s.id}`}
            className="group relative flex flex-col rounded-2xl jr-card p-4 no-underline overflow-hidden transition-all duration-200 hover:border-[rgba(255,156,77,0.28)] hover:-translate-y-0.5"
          >
            <button
              type="button"
              title="Eliminar"
              aria-label="Eliminar sesión"
              disabled={deletingId === s.id}
              onClick={(e) => handleDelete(e, s.id)}
              className="absolute top-2.5 right-2.5 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-black/40 backdrop-blur text-[#8a8a8a] opacity-0 group-hover:opacity-100 transition hover:text-[#ff6b6b] disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="aspect-[4/3] w-full rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
              {s.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.thumb} alt={s.title} className="w-full h-full object-cover" />
              ) : (
                <ImageOff className="w-7 h-7 text-[#4a4a4a]" />
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-bold text-[#f5f5f5] truncate">{s.title}</h3>
              {s.done ? (
                <CheckCircle2 className="w-4 h-4 text-[#2ccf6f] flex-shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-[#ff9c4d] flex-shrink-0" />
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-[#8a8a8a]">{fmtDate(s.created_at)}</span>
              <span className={s.done ? 'text-[#2ccf6f]' : 'text-[#ff9c4d]'}>
                {s.done ? 'Completada' : 'En progreso'}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {items?.length === 0 && (
        <p className="text-[13px] text-[#8a8a8a] mt-6">
          Aún no tienes sesiones guardadas. Crea una nueva para empezar.
        </p>
      )}
    </div>
  )
}
