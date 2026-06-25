'use client'

import { useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { SECTION_LABELS, type LandingSection, type SectionCopy } from '@/lib/landing/types'
import { Smartphone, Monitor } from 'lucide-react'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'
const btnGhost =
  'h-9 px-3 rounded-lg border border-white/[0.14] text-[#f5f5f5] text-[12px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent'
const fieldClass =
  'bg-[#141414] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f5] placeholder:text-[#8a8a8a] focus:border-[rgba(255,156,77,0.5)] outline-none w-full'

// POST una sección (genera o regenera). Reusado por el loop inicial y por el editor.
async function genSection(sessionId: string, type: string, copy: SectionCopy, order: number): Promise<LandingSection> {
  const res = await fetch(`/api/generador-landing/sessions/${sessionId}/section/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ copy, order }),
  })
  const data = (await res.json()) as { section?: LandingSection; error?: string }
  if (!res.ok || !data.section) throw new Error(data.error ?? 'No se pudo generar la sección')
  return data.section
}

function SectionCard({ section }: { section: LandingSection }) {
  const { sessionId, setSectionImage } = useLandingStore()
  const [editing, setEditing] = useState(false)
  const [copy, setCopy] = useState<SectionCopy>(section.copy)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setBullet(i: number, v: string) {
    setCopy((c) => ({ ...c, bullets: (c.bullets ?? []).map((b, j) => (j === i ? v : b)) }))
  }
  function setCard(i: number, key: 'title' | 'body', v: string) {
    setCopy((c) => ({ ...c, cards: (c.cards ?? []).map((card, j) => (j === i ? { ...card, [key]: v } : card)) }))
  }

  async function regenerate() {
    if (!sessionId || saving) return
    setSaving(true)
    setError(null)
    try {
      const updated = await genSection(sessionId, section.type, copy, section.order)
      setSectionImage(updated)
      setEditing(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      {section.imageUrl ? (
        <img src={section.imageUrl} alt={SECTION_LABELS[section.type]} className="w-full block" />
      ) : (
        <div className="w-full aspect-[9/16] bg-[#141414] animate-pulse" />
      )}

      <button onClick={() => setEditing((v) => !v)} className="absolute top-2 right-2 h-8 px-3 rounded-lg bg-black/60 backdrop-blur text-white text-[12px] font-medium hover:bg-black/80 cursor-pointer border-0">
        {editing ? 'Cerrar' : '✎ Editar'}
      </button>

      {editing && (
        <div className="absolute inset-x-0 bottom-0 max-h-[80%] overflow-y-auto bg-black/85 backdrop-blur p-3 flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-[#8a8a8a]">{SECTION_LABELS[section.type]}</p>
          <input className={fieldClass} value={copy.headline} maxLength={60}
            onChange={(e) => setCopy({ ...copy, headline: e.target.value })} placeholder="Titular" />
          <input className={fieldClass} value={copy.subheadline ?? ''} maxLength={90}
            onChange={(e) => setCopy({ ...copy, subheadline: e.target.value || undefined })} placeholder="Subtítulo (opcional)" />

          {copy.bullets?.map((b, i) => (
            <input key={i} className={fieldClass} value={b} maxLength={40}
              onChange={(e) => setBullet(i, e.target.value)} placeholder={`Beneficio ${i + 1}`} />
          ))}

          {copy.cards?.map((card, i) => (
            <div key={i} className="flex gap-2">
              <input className={fieldClass} value={card.title} maxLength={40}
                onChange={(e) => setCard(i, 'title', e.target.value)} placeholder="Título" />
              <input className={fieldClass} value={card.body} maxLength={90}
                onChange={(e) => setCard(i, 'body', e.target.value)} placeholder="Texto" />
            </div>
          ))}

          {copy.cta !== undefined && (
            <input className={fieldClass} value={copy.cta ?? ''} maxLength={25}
              onChange={(e) => setCopy({ ...copy, cta: e.target.value || undefined })} placeholder="Botón" />
          )}
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <button onClick={regenerate} disabled={saving} className={btnGhost + ' justify-center'}>
            {saving ? 'Regenerando...' : '↻ Regenerar sección'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function Section4Preview() {
  const { sessionId, copy, sections, setSectionImage, startNewSession } = useLandingStore()
  const [generating, setGenerating] = useState(false)
  const [done, setDone] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  const [downloading, setDownloading] = useState(false)

  // Genera secuencialmente, una request por sección (Hobby-safe). Cada éxito puebla
  // el preview. Una sección que falla no aborta las demás.
  async function generate() {
    if (!sessionId || generating || copy.length === 0) return
    setGenerating(true)
    setDone(0)
    setError(null)
    let failed = 0
    for (let i = 0; i < copy.length; i++) {
      try {
        const section = await genSection(sessionId, copy[i].type, copy[i], i)
        setSectionImage(section)
      } catch (err) {
        failed++
        console.error(err)
      }
      setDone(i + 1)
    }
    if (failed === copy.length) setError('No se pudo generar ninguna sección')
    setGenerating(false)
  }

  // Descarga cada sección como archivo aparte (Storage manda ACAO:* → fetch directo).
  async function download() {
    if (downloading || sections.length === 0) return
    setDownloading(true)
    setError(null)
    try {
      for (const s of sections) {
        if (!s.imageUrl) continue
        const blob = await (await fetch(s.imageUrl)).blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `landing-${s.order + 1}-${s.type}.jpg`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  if (!sessionId) return null

  const frameWidth = device === 'mobile' ? 'max-w-[380px]' : 'max-w-[720px]'

  return (
    <div className="flex flex-col gap-4">
      {sections.length === 0 && !generating && (
        <button onClick={generate} className={btnPrimary}>
          Generar mi landing ({copy.length} secciones)
        </button>
      )}

      {generating && (
        <p className="text-[12px] text-[#bdbdbd]">Generando secciones... {done}/{copy.length}</p>
      )}

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      {(sections.length > 0 || generating) && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-[#8a8a8a]">Vista previa</p>
            <div className="flex gap-1 bg-[#141414] rounded-lg p-1 border border-white/[0.06]">
              <button onClick={() => setDevice('mobile')} className={`h-7 w-8 rounded flex items-center justify-center cursor-pointer border-0 ${device === 'mobile' ? 'bg-[rgba(255,156,77,0.15)] text-[#ff9c4d]' : 'bg-transparent text-[#8a8a8a]'}`}><Smartphone className="w-4 h-4" /></button>
              <button onClick={() => setDevice('desktop')} className={`h-7 w-8 rounded flex items-center justify-center cursor-pointer border-0 ${device === 'desktop' ? 'bg-[rgba(255,156,77,0.15)] text-[#ff9c4d]' : 'bg-transparent text-[#8a8a8a]'}`}><Monitor className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Frame: imágenes apiladas de aspecto fijo; el toggle cambia solo el ancho del marco. */}
          <div className={`mx-auto w-full ${frameWidth} rounded-2xl overflow-hidden border border-white/[0.08] bg-white transition-all duration-300`}>
            {sections.map((s) => <SectionCard key={s.type} section={s} />)}
            {generating && Array.from({ length: Math.max(0, copy.length - sections.length) }).map((_, i) => (
              <div key={`sk-${i}`} className="w-full aspect-[9/16] bg-[#141414] animate-pulse border-t border-white/[0.06]" />
            ))}
          </div>

          {!generating && sections.length > 0 && (
            <div className="flex gap-2 items-center">
              <button onClick={download} disabled={downloading} className={btnPrimary + ' flex-1'}>
                {downloading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Descargando...</> : '↓ Descargar secciones'}
              </button>
              <button onClick={generate} className={btnGhost}>↻ Regenerar todo</button>
              <button onClick={startNewSession} className={btnGhost}>Nueva landing</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
