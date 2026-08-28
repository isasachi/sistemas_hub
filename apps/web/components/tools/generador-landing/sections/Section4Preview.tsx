'use client'

import { useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { SECTION_LABELS, type LandingSection, type SectionCopy, type SectionType } from '@/lib/landing/types'
import { Smartphone, Monitor, Loader2, AlertCircle } from 'lucide-react'
import { RegenControls } from '@/components/tools/ui/RegenControls'
import { GenerationProgress } from '@/components/tools/ui/GenerationProgress'
import BackToDashboard from '@/components/tools/ui/BackToDashboard'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'
const btnGhost =
  'h-9 px-3 rounded-lg border border-white/[0.14] text-[#efe7e0] text-[12px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent'
const fieldClass = 'jr-field w-full rounded-lg px-3 py-2 text-[13px]'

// Estado de generación por sección (cliente): 'pending' en cola, 'generating' en vuelo,
// 'done' lista (ya en el store), 'error' falló tras los reintentos.
type GenStatus = 'pending' | 'generating' | 'done' | 'error'

// Error de generación con flag de reintentable (la ruta manda retryable:true en 502; 5xx = red).
class GenError extends Error {
  retryable: boolean
  constructor(message: string, retryable: boolean) { super(message); this.retryable = retryable }
}

// POST una sección (genera o regenera). Reusado por el pool inicial y por el editor.
async function genSection(
  sessionId: string, type: SectionType, copy: SectionCopy, order: number, prompt?: string,
): Promise<{ section: LandingSection; regensLeft?: number }> {
  const res = await fetch(`/api/generador-landing/sessions/${sessionId}/section/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ copy, order, prompt: prompt?.trim() || undefined }),
  })
  const data = (await res.json()) as { section?: LandingSection; regensLeft?: number; error?: string; retryable?: boolean }
  if (!res.ok || !data.section) throw new GenError(data.error ?? 'No se pudo generar la sección', res.status >= 500 || data.retryable === true)
  return { section: data.section, regensLeft: data.regensLeft }
}

// Reintento automático de las fallas REINTENTABLES (hasta 2), con backoff corto (evita recolisión
// con el rate limit de Gemini). Una falla no-reintentable (400, cuota) corta al toque.
async function genWithRetry(
  sessionId: string, type: SectionType, copy: SectionCopy, order: number, retries = 2,
): Promise<{ section: LandingSection; regensLeft?: number }> {
  let last: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await genSection(sessionId, type, copy, order)
    } catch (err) {
      last = err
      if (!(err instanceof GenError) || !err.retryable || attempt === retries) throw err
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw last
}

// Pool de concurrencia acotada: procesa `items` con a lo sumo `limit` en vuelo. Cada worker no
// lanza (captura su error) → un ítem que falla no aborta a los demás (criterio de aceptación #3).
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  async function next(): Promise<void> {
    const idx = i++
    if (idx >= items.length) return
    await worker(items[idx])
    return next()
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()))
}

function SectionCard({ section }: { section: LandingSection }) {
  const { sessionId, setSectionImage, regens, setRegen } = useLandingStore()
  const [editing, setEditing] = useState(false)
  const [copy, setCopy] = useState<SectionCopy>(section.copy)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')

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
      const { section: updated, regensLeft } = await genSection(sessionId, section.type, copy, section.order, prompt)
      setSectionImage(updated)
      if (typeof regensLeft === 'number') setRegen(`landing-section:${section.type}`, regensLeft)
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
        <div className="w-full aspect-[9/16] bg-[#2a0f1a] animate-pulse" />
      )}

      <button onClick={() => setEditing((v) => !v)} className="absolute top-2 right-2 h-8 px-3 rounded-lg bg-black/60 backdrop-blur text-white text-[12px] font-medium hover:bg-black/80 cursor-pointer border-0">
        {editing ? 'Cerrar' : '✎ Editar'}
      </button>

      {editing && (
        <div className="absolute inset-x-0 bottom-0 max-h-[80%] overflow-y-auto bg-black/85 backdrop-blur p-3 flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-[#a98c88]">{SECTION_LABELS[section.type]}</p>
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
          <RegenControls
            regensLeft={regens[`landing-section:${section.type}`] ?? 3}
            prompt={prompt}
            onPromptChange={setPrompt}
            onRegenerate={regenerate}
            busy={saving}
            label="↻ Regenerar sección"
          />
        </div>
      )}
    </div>
  )
}

// Placeholder por sección aún no lista, con su estado (en cola / generando / falló).
function SectionSkeleton({ type, status }: { type: SectionType; status: GenStatus }) {
  return (
    <div className={`relative w-full aspect-[9/16] bg-[#2a0f1a] border-t border-white/[0.06] flex flex-col items-center justify-center gap-2 ${status === 'generating' ? 'animate-pulse' : ''}`}>
      <span className="text-[12px] text-[#a98c88] font-medium">{SECTION_LABELS[type]}</span>
      {status === 'generating' && <span className="flex items-center gap-1.5 text-[11px] text-[#e8467a]"><Loader2 className="w-3.5 h-3.5 animate-spin" />Generando…</span>}
      {status === 'pending' && <span className="text-[11px] text-[#967b76]">En cola</span>}
      {status === 'error' && <span className="flex items-center gap-1.5 text-[11px] text-red-400"><AlertCircle className="w-3.5 h-3.5" />Falló · usa Reanudar</span>}
    </div>
  )
}

export default function Section4Preview() {
  const { sessionId, copy, sections, setSectionImage, startNewSession, setRegen } = useLandingStore()
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState<Record<string, GenStatus>>({})
  const [error, setError] = useState<string | null>(null)
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  const [downloading, setDownloading] = useState(false)

  // Genera las secciones en PARALELO con concurrencia 3 (Fase 6). El ancla de producto ya es
  // canónica (derivada de la foto en la etapa 2), así que las secciones son independientes y el
  // orden de generación es indiferente. `resume` genera solo las que faltan (pending/error).
  async function generate(opts?: { resume?: boolean }) {
    if (!sessionId || generating || copy.length === 0) return
    setGenerating(true)
    setError(null)

    const doneTypes = new Set(sections.filter((s) => s.imageUrl).map((s) => s.type))
    const targets = copy
      .map((c, i) => ({ c, order: i }))
      .filter(({ c }) => !opts?.resume || !doneTypes.has(c.kind))

    // ⚠️ EL ESTADO INICIAL SALE DE `targets`, NO DE `doneTypes` — y ésa era la causa de que
    // "Regenerar todo" dejara la barra clavada en 100 %. Sin `resume`, TODAS las secciones tienen
    // `imageUrl` (por eso hay algo que regenerar), así que `doneTypes` las contenía a todas y el
    // estado inicial las marcaba `done` de entrada: la barra arrancaba llena y las previews se
    // quedaban con la imagen vieja como si ya hubieran terminado.
    //
    // La regla correcta es la que ya expresa `targets`: lo que se va a generar arranca PENDIENTE,
    // lo que no se toca queda `done`. Así sirve igual para "Regenerar todo" (todo pendiente) y
    // para "Reanudar" (solo las que faltan).
    const aGenerar = new Set(targets.map(({ c }) => c.kind))
    const initial: Record<string, GenStatus> = {}
    for (const c of copy) initial[c.kind] = aGenerar.has(c.kind) ? 'pending' : 'done'
    setStatus(initial)

    let failed = 0
    await runPool(targets, 3, async ({ c, order }) => {
      setStatus((s) => ({ ...s, [c.kind]: 'generating' }))
      try {
        const { section, regensLeft } = await genWithRetry(sessionId, c.kind, c, order)
        setSectionImage(section)
        if (typeof regensLeft === 'number') setRegen(`landing-section:${c.kind}`, regensLeft)
        setStatus((s) => ({ ...s, [c.kind]: 'done' }))
      } catch (err) {
        failed++
        setStatus((s) => ({ ...s, [c.kind]: 'error' }))
        console.error(err)
      }
    })

    if (failed > 0) {
      setError(
        failed === targets.length
          ? 'No se pudo generar ninguna sección. Reintenta con “Reanudar”.'
          : `${failed} de ${targets.length} secciones fallaron. Usa “Reanudar” para reintentar solo esas.`
      )
    }
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
  // ⚠️ MIENTRAS SE GENERA, EL PROGRESO SE CUENTA DEL ESTADO, NO DEL STORE. El store conserva las
  // imágenes viejas durante una regeneración —es lo que permite seguir viendo la landing anterior
  // hasta que llega la nueva—, así que contar `sections` daba 8/8 desde el primer segundo.
  const doneCount = generating
    ? copy.filter((c) => status[c.kind] === 'done').length
    : sections.filter((s) => s.imageUrl).length
  // `missing` es para el botón "Reanudar" y SÍ mira el store: son las que no tienen imagen.
  const missing = copy.length - sections.filter((s) => s.imageUrl).length

  return (
    <div className="flex flex-col gap-4">
      {sections.length === 0 && !generating && (
        <button onClick={() => generate()} className={btnPrimary}>
          Generar mi landing ({copy.length} secciones)
        </button>
      )}

      {generating && (
        <GenerationProgress
          percent={copy.length ? (doneCount / copy.length) * 100 : 0}
          label={`Generando en paralelo · ${doneCount}/${copy.length}`}
          hint="Las secciones aparecen a medida que terminan (hasta 3 a la vez)."
        />
      )}

      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      {(sections.length > 0 || generating) && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-[#a98c88]">Vista previa</p>
            <div className="flex gap-1 bg-[#2a0f1a] rounded-lg p-1 border border-white/[0.06]">
              <button onClick={() => setDevice('mobile')} className={`h-7 w-8 rounded flex items-center justify-center cursor-pointer border-0 ${device === 'mobile' ? 'bg-[rgba(232,70,122,0.15)] text-[#e8467a]' : 'bg-transparent text-[#a98c88]'}`}><Smartphone className="w-4 h-4" /></button>
              <button onClick={() => setDevice('desktop')} className={`h-7 w-8 rounded flex items-center justify-center cursor-pointer border-0 ${device === 'desktop' ? 'bg-[rgba(232,70,122,0.15)] text-[#e8467a]' : 'bg-transparent text-[#a98c88]'}`}><Monitor className="w-4 h-4" /></button>
            </div>
          </div>

          {/* En orden de sección: la lista viene a medida que termina cada una; las que faltan
              muestran un placeholder con su estado (Fase 6 · progreso real). */}
          <div className={`mx-auto w-full ${frameWidth} rounded-2xl overflow-hidden border border-white/[0.08] bg-white transition-all duration-300`}>
            {copy.map((c) => {
              // ⚠️ La imagen VIEJA no puede quedarse en pantalla mientras esa sección se
              // regenera: se veía terminada cuando en realidad estaba en cola. Si su estado dice
              // que está pendiente o generándose, manda el esqueleto aunque el store todavía
              // tenga la anterior.
              const est = status[c.kind] ?? 'pending'
              // ⚠️ Atado a `generating`: al montar la pantalla `status` está VACÍO, así que sin
              // esta condición el default `pending` pintaría una landing YA TERMINADA entera en
              // esqueleto. Solo hay esqueleto mientras hay una generación en curso.
              const regenerando = generating && (est === 'pending' || est === 'generating')
              const s = sections.find((x) => x.type === c.kind && x.imageUrl)
              return s && !regenerando
                ? <SectionCard key={c.kind} section={s} />
                : <SectionSkeleton key={c.kind} type={c.kind} status={est} />
            })}
          </div>

          {!generating && sections.length > 0 && (
            <div className="flex gap-2 items-center flex-wrap">
              {missing > 0 && (
                <button onClick={() => generate({ resume: true })} className={btnPrimary + ' flex-1'}>
                  ↻ Reanudar generación ({missing} pendiente{missing > 1 ? 's' : ''})
                </button>
              )}
              {missing === 0 && (
                <button onClick={download} disabled={downloading} className={btnPrimary + ' flex-1'}>
                  {downloading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Descargando...</> : '↓ Descargar secciones'}
                </button>
              )}
              <button onClick={() => generate()} className={btnGhost}>↻ Regenerar todo</button>
              <button onClick={startNewSession} className={btnGhost}>Nueva landing</button>
              <BackToDashboard />
            </div>
          )}
        </>
      )}
    </div>
  )
}
