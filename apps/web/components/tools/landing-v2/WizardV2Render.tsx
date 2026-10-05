'use client'

// Pasos 6 y 7 del wizard v2: editor de copy y render sección por sección con aprobación.
import { useEffect, useRef, useState } from 'react'
import { Check, Download, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { SECTION_BY_ID, inSkeletonOrder, type SectionId } from '@/lib/landing-v2/catalog'
import { getNextSection, sectionSupport } from '@/lib/landing-v2/flow'
import { latestVersion, type LandingSession, type SectionCopy } from '@/lib/landing-v2/schemas'
import { VALIDATION_PHRASE } from '@/lib/landing-v2/system-prompt'
import { api } from './client'
import { SectionImage, downloadAll } from './SectionImage'
import { btnGhost, btnPrimary, ErrorBox, Spinner, type StepProps } from './WizardV2'

const field = 'jr-field w-full rounded-lg px-3 py-2 text-[14px]'

// ─── Paso 6: copy ───────────────────────────────────────────────────────────────

export function CopyStep({ session, setSession, next }: StepProps) {
  const [copies, setCopies] = useState<LandingSession['copies']>(session?.copies ?? {})
  const [busy, setBusy] = useState<'gen' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const ids = session ? inSkeletonOrder(session.selected).filter((id) => sectionSupport(session, id).ok) : []

  async function generate(regenerate = false) {
    if (!session) return
    setBusy('gen'); setError(null)
    try {
      const { session: out } = await api.post(session.id, 'copy', { regenerate })
      setSession(out); setCopies(out.copies)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  useEffect(() => {
    if (started.current || !session) return
    started.current = true
    if (ids.some((id) => !session.copies[id])) generate()
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!session) return
    setBusy('save'); setError(null)
    try { setSession((await api.patch(session.id, { copies })).session); next() }
    catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const edit = (id: SectionId, patch: Partial<SectionCopy>) => setCopies((c) => ({ ...c, [id]: { ...c[id]!, ...patch } }))
  const editItem = (id: SectionId, k: number, patch: Partial<SectionCopy['items'][number]>) =>
    edit(id, { items: copies[id]!.items.map((it, j) => (j === k ? { ...it, ...patch } : it)) })

  if (busy === 'gen') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-14 text-center" aria-live="polite">
        <Spinner /><p className="text-[14px] text-[#efe7e0]">Escribiendo el copy de {ids.length} secciones…</p>
        <p className="text-[12px] text-[#a98c88]">Usamos solo los datos que nos diste.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {ids.map((id) => {
        const c = copies[id]
        if (!c) return null
        return (
          <details key={id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
            <summary className="cursor-pointer select-none text-[14px] font-semibold text-[#efe7e0]">
              {SECTION_BY_ID[id].wf}. {SECTION_BY_ID[id].es} <span className="font-normal text-[#a98c88]">— {c.headline}</span>
            </summary>
            <div className="flex flex-col gap-3 pt-4">
              <input className={field} value={c.headline} onChange={(e) => edit(id, { headline: e.target.value })} aria-label="Titular" placeholder="Titular" />
              <input className={field} value={c.subheadline ?? ''} onChange={(e) => edit(id, { subheadline: e.target.value || null })} aria-label="Subtítulo" placeholder="Subtítulo (opcional)" />
              {c.items.map((it, k) => (
                <div key={k} className="flex gap-2">
                  <div className="flex flex-1 flex-col gap-1.5">
                    {it.group !== null && <span className="text-[11px] uppercase tracking-wide text-[#a98c88]">{it.group}</span>}
                    <input className={field} value={it.title ?? ''} onChange={(e) => editItem(id, k, { title: e.target.value || null })} aria-label="Título del bloque" placeholder="Título del bloque (opcional)" />
                    <textarea className={field} rows={2} value={it.text} onChange={(e) => editItem(id, k, { text: e.target.value })} aria-label="Texto del bloque" />
                  </div>
                  <button type="button" aria-label="Quitar bloque" onClick={() => edit(id, { items: c.items.filter((_, j) => j !== k) })}
                          className="h-9 w-9 shrink-0 rounded-lg border-0 bg-transparent text-[#a98c88] hover:text-[#efe7e0] cursor-pointer"><Trash2 className="mx-auto h-4 w-4" /></button>
                </div>
              ))}
              {id !== 'testimonials' && (
                <button type="button" className={`${btnGhost} h-9 w-fit`} onClick={() => edit(id, { items: [...c.items, { group: null, title: null, text: '' }] })}>
                  <Plus className="h-4 w-4" /> Agregar bloque
                </button>
              )}
              <input className={field} value={c.closingLine ?? ''} onChange={(e) => edit(id, { closingLine: e.target.value || null })} aria-label="Cierre" placeholder="Línea de cierre (opcional)" />
              {SECTION_BY_ID[id].cta && <input className={field} value={c.cta ?? ''} onChange={(e) => edit(id, { cta: e.target.value || null })} aria-label="Botón" placeholder="Texto del botón" />}
            </div>
          </details>
        )
      })}
      <ErrorBox msg={error} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={submit} disabled={!!busy || !ids.every((id) => copies[id])} className={btnPrimary}>
          {busy === 'save' ? <><Spinner />Guardando…</> : 'Generar las imágenes'}
        </button>
        <button type="button" onClick={() => generate(true)} disabled={!!busy} className={`${btnGhost} sm:w-auto`}><RefreshCw className="h-4 w-4" /> Reescribir todo</button>
      </div>
    </div>
  )
}

// ─── Paso 7: render ─────────────────────────────────────────────────────────────

/** La sección en la que se trabaja: la actual si espera validación; si no, la siguiente del esqueleto. */
function workingSection(s: LandingSession): SectionId | null {
  if (s.current && !s.sections[s.current]?.approved && s.selected.includes(s.current)) return s.current
  return getNextSection(s)
}

export function RenderStep({ session, setSession }: StepProps) {
  const [busy, setBusy] = useState<'gen' | 'revise' | 'approve' | 'zip' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [asking, setAsking] = useState(false)
  const tried = useRef<Set<string>>(new Set())
  const id = session ? workingSection(session) : null
  const version = session && id ? latestVersion(session, id) : null

  async function act(kind: 'gen' | 'revise' | 'approve', body: object) {
    if (!session || !id) return
    setBusy(kind); setError(null)
    try {
      setSession((await api.post(session.id, `sections/${id}`, body)).session)
      if (kind === 'revise') { setFeedback(''); setAsking(false) }
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  // Genera sola la sección en curso si todavía no tiene imagen (al entrar y tras cada aprobación).
  useEffect(() => {
    if (!session || !id || version || busy || tried.current.has(id)) return
    tried.current.add(id)
    act('gen', { action: 'generate' })
  }, [session, id, version, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return null
  const approved = inSkeletonOrder(session.selected).filter((x) => session.sections[x]?.approved)
  const total = inSkeletonOrder(session.selected).filter((x) => sectionSupport(session, x).ok).length
  const approvedItems = approved.map((x) => ({ id: x, url: latestVersion(session, x)!.imageUrl }))

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="flex flex-col gap-4">
        {id ? (
          <>
            <p className="lp-label">Sección {SECTION_BY_ID[id].wf} de 14 · {SECTION_BY_ID[id].es} · {approved.length}/{total} aprobadas</p>
            {busy === 'gen' || busy === 'revise' || (!version && !error) ? (
              <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 text-center" aria-live="polite">
                <Spinner />
                <p className="text-[14px] text-[#efe7e0]">{busy === 'revise' ? 'Aplicando tus cambios…' : `Diseñando «${SECTION_BY_ID[id].es}»…`}</p>
                <p className="text-[12px] text-[#a98c88]">Suele tardar entre 30 segundos y un minuto.</p>
              </div>
            ) : version ? (
              <SectionImage id={id} url={version.imageUrl} />
            ) : null}
            <ErrorBox msg={error} />
            {error && !version && <button type="button" className={btnGhost} onClick={() => act('gen', { action: 'generate' })}><RefreshCw className="h-4 w-4" /> Reintentar</button>}
            {version && !busy && (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-[#c9b4ae]">{VALIDATION_PHRASE}</p>
                {asking ? (
                  <>
                    <textarea className={field} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} autoFocus
                              placeholder="¿Qué cambiamos? Ej.: el titular más grande, fondo más claro…" aria-label="Cambios" />
                    <div className="flex gap-2">
                      <button type="button" className={btnPrimary} disabled={feedback.trim().length < 3} onClick={() => act('revise', { action: 'revise', feedback })}>Aplicar cambios</button>
                      <button type="button" className={`${btnGhost} shrink-0`} onClick={() => setAsking(false)}>Cancelar</button>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" className={btnPrimary} onClick={() => act('approve', { action: 'approve' })}><Check className="h-4 w-4" /> Aprobar</button>
                    <button type="button" className={`${btnGhost} shrink-0`} onClick={() => setAsking(true)}>Pedir cambios</button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
            <p className="text-[16px] font-semibold text-[#f6f2eb]">¡Tu landing está lista!</p>
            <p className="text-[13px] text-[#c9b4ae]">Aprobaste {approved.length} secciones. Descárgalas y súbelas en este orden.</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="lp-label">Aprobadas</p>
          {approvedItems.length > 0 && (
            <button type="button" className={`${btnGhost} h-9`} disabled={busy === 'zip'}
                    onClick={async () => { setBusy('zip'); try { await downloadAll(approvedItems) } catch (e) { setError((e as Error).message) } finally { setBusy(null) } }}>
              {busy === 'zip' ? <Spinner /> : <Download className="h-4 w-4" />} Descargar todas
            </button>
          )}
        </div>
        {approvedItems.length ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
            {approvedItems.map((it) => <SectionImage key={it.id} id={it.id} url={it.url} />)}
          </div>
        ) : <p className="text-[13px] text-[#a98c88]">Las secciones que apruebes aparecen aquí, en el orden de la landing.</p>}
      </div>
    </div>
  )
}
