'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Check } from 'lucide-react'
import { useWizardStore } from '@/store/wizard'
import type { ReferenceAnalysis } from '@/lib/types'

const btnPrimary = 'h-11 w-full rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

/** Los cuatro objetivos publicitarios del §31, en el orden del embudo. */
const GRUPOS = [
  { id: 'captar', titulo: 'Captar atención' },
  { id: 'educar', titulo: 'Educar' },
  { id: 'persuadir', titulo: 'Persuadir' },
  { id: 'convertir', titulo: 'Convertir' },
] as const

interface Plantilla {
  id: string
  nombre: string
  objetivo: string
  descripcion: string
  recomendadaPara: string
  imagenUrl: string
  huecos: number
}

/**
 * Elegir plantilla — paso 1 del flujo de plantilla.
 *
 * Agrupadas por OBJETIVO publicitario y no como una lista plana (§31): a quien hace marketing le
 * dice más "para captar atención" que ocho layouts sin contexto.
 */
export default function Section0Template() {
  const { ensureSession, templateId, setTemplate, setLoading, isLoading } = useWizardStore()
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null)
  const [elegida, setElegida] = useState<string | null>(templateId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/generador-anuncios/plantillas')
      .then((r) => r.json() as Promise<{ plantillas: Plantilla[] }>)
      .then((d) => setPlantillas(d.plantillas))
      .catch(() => setError('No se pudo cargar el catálogo de plantillas.'))
  }, [])

  async function handleSubmit() {
    if (!elegida || isLoading) return
    // La fila nace acá, con el primer insumo real — no al montar el wizard.
    const sessionId = await ensureSession()
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-anuncios/sessions/${sessionId}/plantilla`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: elegida }),
      })
      const data = await res.json() as { referenceUrl?: string; analysis?: ReferenceAnalysis; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo elegir la plantilla')
      setTemplate(elegida, data.referenceUrl!, data.analysis!)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (error && !plantillas)
    return <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>

  if (!plantillas)
    return <div className="text-[12px] text-[#c9b4ae]">Cargando plantillas…</div>

  return (
    <div className="flex flex-col gap-6">
      {GRUPOS.map((g) => {
        const delGrupo = plantillas.filter((p) => p.objetivo === g.id)
        if (delGrupo.length === 0) return null
        return (
          <div key={g.id} className="flex flex-col gap-3">
            <h3 className="text-[11px] uppercase tracking-wider text-[#c9b4ae]">{g.titulo}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {delGrupo.map((p) => {
                const activa = elegida === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setElegida(p.id)}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                      activa ? 'border-[#E8467A] bg-[#14050a]' : 'border-white/[0.06] bg-[#14050a] hover:border-white/20'
                    }`}
                  >
                    <div className="relative aspect-[4/5] w-full bg-white/[0.03]">
                      {/* `unoptimized`: son 8 assets fijos del bucket, no vale la pena pasarlos
                          por el optimizador en cada vista. */}
                      <Image src={p.imagenUrl} alt={p.nombre} fill unoptimized className="object-cover" />
                      {activa && (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#BD1347] text-white">
                          <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 px-3 py-3">
                      <span className="text-[13px] font-bold text-[#F6F2EB]">{p.nombre}</span>
                      <span className="text-[11px] leading-snug text-[#c9b4ae]">{p.descripcion}</span>
                      <span className="mt-1 text-[10px] text-[#8a7a76]">{p.huecos} textos</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {elegida && (
        <p className="text-[11px] leading-snug text-[#c9b4ae]">
          {plantillas.find((p) => p.id === elegida)?.recomendadaPara}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      <button onClick={handleSubmit} disabled={!elegida || isLoading} className={btnPrimary}>
        {isLoading ? 'Guardando…' : 'Usar esta plantilla →'}
      </button>
    </div>
  )
}
