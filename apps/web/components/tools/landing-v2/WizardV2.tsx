'use client'

// Vista A — Wizard v2: el chrome y los componentes del wizard actual (StepWizard, FieldGroup,
// FileUpload, ChipGroup) pidiendo los inputs del flujo nuevo. Todo lo que habla con modelos va por
// /api/landing-v2 (el núcleo compartido con el chat).
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import StepWizard from '@/components/tools/ui/StepWizard'
import { FieldGroup } from '@/components/tools/ui/FieldGroup'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { ChipGroup } from '@/components/tools/ui/ChipGroup'
import { SECTIONS, SECTION_BY_ID } from '@/lib/landing-v2/catalog'
import { sectionSupport } from '@/lib/landing-v2/flow'
import { NICHES, NICHE_LABELS, type LandingSession, type Niche, type Pack } from '@/lib/landing-v2/schemas'
import { api, importImageUrl, uploadFile, useV2Session } from './client'
import { CopyStep, RenderStep } from './WizardV2Render'

export const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'
export const btnGhost = 'jr-btn-ghost h-11 rounded-xl px-4 text-[13px] cursor-pointer flex items-center justify-center gap-2'
const field = 'jr-field h-10 w-full rounded-lg px-3 text-[14px]'

export const Spinner = () => <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
export const ErrorBox = ({ msg }: { msg: string | null }) =>
  msg ? <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{msg}</div> : null

export type StepProps = {
  session: LandingSession | null
  ensure: () => Promise<LandingSession>
  setSession: (s: LandingSession) => void
  next: () => void
}

const STEPS = [
  { label: 'Producto', title: 'Cuéntanos qué vendes', hint: 'Nombre exacto, nicho y tus precios. Solo usamos las condiciones de compra que escribas.' },
  { label: 'Investigación', title: 'Investigación de mercado', hint: 'Pega tu investigación y psicología del consumidor, o adjunta un PDF o Word. Todo el copy sale de aquí.' },
  { label: 'Imagen', title: 'La imagen de tu producto', hint: 'Es la referencia real: el producto sale igual en cada sección.' },
  { label: 'Sistema visual', title: 'El sistema visual de tu landing', hint: 'Lo definimos a partir de tu producto y tu marca. Si no te convence, lo volvemos a analizar.' },
  { label: 'Secciones', title: 'Las secciones de tu landing', hint: 'Siguen el esqueleto CRO en este orden. Desmarca las que no quieras.' },
  { label: 'Copy', title: 'El copy de cada sección', hint: 'Revísalo y edítalo antes de generar las imágenes.' },
  { label: 'Landing', title: 'Tu landing, sección por sección', hint: 'Aprueba cada sección o pide cambios. Al aprobar, pasamos a la siguiente.' },
]

/** El paso donde retomar una sesión guardada, deducido de lo que ya tiene. */
function resumeStep(s: LandingSession): number {
  if (Object.values(s.sections).some((x) => x?.versions.length)) return 6
  if (Object.keys(s.copies).length) return 5
  if (s.visualSystem) return 4
  if (s.inputs.productImageUrl) return 3
  if (s.inputs.marketResearch) return 2
  if (s.inputs.productName) return 1
  return 0
}

export default function WizardV2({ switcher }: { switcher: React.ReactNode }) {
  const { session, setSession, loading, ensure, reset } = useV2Session('wizard')
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const resumed = useRef(false)

  useEffect(() => {
    if (resumed.current || loading || !session) return
    resumed.current = true
    const s = resumeStep(session)
    setStep(s); setMaxReached(s)
  }, [loading, session])

  const go = (i: number) => { setStep(i); setMaxReached((m) => Math.max(m, i)) }
  const props: StepProps = { session, ensure, setSession, next: () => go(step + 1) }
  const Body = [BriefStep, ResearchStep, ImageStep, AnalysisStep, SectionsStep, CopyStep, RenderStep][step]

  return (
    <StepWizard
      steps={STEPS}
      current={step}
      maxReached={maxReached}
      onNavigate={go}
      backHref="/tools/generador-landing"
      onReset={() => { reset(); resumed.current = true; setStep(0); setMaxReached(0) }}
      actions={switcher}
      full={step === 6}
    >
      {loading ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div key={session?.id ?? 'new'} className={step === 6 ? 'mx-auto w-full max-w-[1160px] px-5 pb-16 md:px-8' : ''}>
          <Body {...props} />
        </div>
      )}
    </StepWizard>
  )
}

// ─── Paso 1: brief ─────────────────────────────────────────────────────────────

const emptyPack = (): Pack => ({ name: '', quantity: 1, price: 0, compareAt: null, label: null })

function BriefStep({ session, ensure, setSession, next }: StepProps) {
  const i = session?.inputs
  const [name, setName] = useState(i?.productName ?? '')
  const [niche, setNiche] = useState<Niche | null>(i?.niche ?? null)
  const [nicheOther, setNicheOther] = useState(i?.nicheOther ?? '')
  const [packs, setPacks] = useState<Pack[]>(i?.pricing?.packs?.length ? i.pricing.packs : [emptyPack()])
  const [notes, setNotes] = useState(i?.pricing?.notes ?? '')
  const [cta, setCta] = useState(i?.ctaText ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validPacks = packs.filter((p) => p.name.trim() && p.price > 0)
  const ok = name.trim() && niche && (niche !== 'other' || nicheOther.trim()) && validPacks.length
  const upd = (k: number, patch: Partial<Pack>) => setPacks((ps) => ps.map((p, j) => (j === k ? { ...p, ...patch } : p)))
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

  async function submit() {
    if (!ok || busy) return
    setBusy(true); setError(null)
    try {
      const s = await ensure()
      const { session: out } = await api.patch(s.id, {
        inputs: {
          productName: name.trim(), niche, nicheOther: niche === 'other' ? nicheOther.trim() : null,
          pricing: { packs: validPacks.map((p) => ({ ...p, name: p.name.trim(), label: p.label?.trim() || null })), notes: notes.trim() },
          ctaText: cta.trim() || null,
        },
      })
      setSession(out); next()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const nicheLabels = NICHES.map((n) => NICHE_LABELS[n])
  return (
    <div className="flex flex-col gap-5">
      <FieldGroup type="input" id="v2-name" label="Nombre exacto del producto" required value={name} onChange={setName} placeholder="Tal como aparece en el envase" />

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-[#efe7e0]">Nicho<span className="ml-0.5 text-[#e8467a]" aria-hidden>*</span></label>
        <ChipGroup options={nicheLabels} selected={niche ? NICHE_LABELS[niche] : ''} onChange={(v) => setNiche(NICHES[nicheLabels.indexOf(v as string)])} />
        {niche === 'other' && <input className={field} value={nicheOther} onChange={(e) => setNicheOther(e.target.value)} placeholder="¿Cuál?" aria-label="Otro nicho" />}
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-[13px] font-semibold text-[#efe7e0]">Precios, ofertas y packs<span className="ml-0.5 text-[#e8467a]" aria-hidden>*</span>
          <span className="ml-1.5 font-normal text-[#a98c88]">en soles</span></label>
        {packs.map((p, k) => (
          <div key={k} className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1.4fr_auto]">
            <input className={`${field} col-span-2 sm:col-span-1`} value={p.name} onChange={(e) => upd(k, { name: e.target.value })} placeholder="Nombre del pack" aria-label="Nombre del pack" />
            <input className={field} type="number" min={1} value={p.quantity} onChange={(e) => upd(k, { quantity: Math.max(1, Number(e.target.value) || 1) })} aria-label="Cantidad" title="Cantidad" />
            <input className={field} type="number" min={0} step="0.01" value={p.price || ''} onChange={(e) => upd(k, { price: num(e.target.value) ?? 0 })} placeholder="Precio" aria-label="Precio" />
            <input className={field} type="number" min={0} step="0.01" value={p.compareAt ?? ''} onChange={(e) => upd(k, { compareAt: num(e.target.value) })} placeholder="Antes" aria-label="Precio anterior (opcional)" title="Precio anterior (opcional)" />
            <input className={field} value={p.label ?? ''} onChange={(e) => upd(k, { label: e.target.value || null })} placeholder="Etiqueta (opcional)" aria-label="Etiqueta" />
            <button type="button" onClick={() => setPacks((ps) => ps.filter((_, j) => j !== k))} disabled={packs.length === 1}
                    aria-label="Quitar pack" className="flex h-10 w-10 items-center justify-center rounded-lg border-0 bg-transparent text-[#a98c88] hover:text-[#efe7e0] disabled:opacity-30 cursor-pointer">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setPacks((ps) => [...ps, emptyPack()])} className={`${btnGhost} w-fit`}>
          <Plus className="h-4 w-4" /> Agregar pack
        </button>
      </div>

      <FieldGroup type="textarea" id="v2-notes" label="Condiciones de compra" helper="(opcional — envío, contra entrega, garantía, urgencia. Si no las escribes, no se mencionan)"
                  rows={3} value={notes} onChange={setNotes} />
      <FieldGroup type="input" id="v2-cta" label="Texto del botón" helper="(opcional)" value={cta} onChange={setCta} />

      <ErrorBox msg={error} />
      <button type="button" onClick={submit} disabled={!ok || busy} className={btnPrimary}>{busy ? <><Spinner />Guardando…</> : 'Continuar'}</button>
    </div>
  )
}

// ─── Paso 2: investigación ──────────────────────────────────────────────────────

function ResearchStep({ session, ensure, setSession, next }: StepProps) {
  const [mode, setMode] = useState<'paste' | 'file'>('paste')
  const [text, setText] = useState(session?.inputs.marketResearch ?? '')
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState<'extract' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(f: File) {
    setBusy('extract'); setError(null)
    try {
      const s = await ensure()
      const up = await uploadFile(s.id, f, 'document')
      const { text: t } = await api.post<{ text: string }>(s.id, 'extract', { url: up.url })
      setText(t); setFileName(f.name)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  async function submit() {
    setBusy('save'); setError(null)
    try {
      const s = await ensure()
      const { session: out } = await api.patch(s.id, { inputs: { marketResearch: text.trim() } })
      setSession(out); next()
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const tab = (m: typeof mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`h-9 rounded-lg border-0 px-4 font-sans text-[13px] font-semibold cursor-pointer ${mode === m ? 'bg-[rgba(246,242,235,0.12)] text-[#f6f2eb]' : 'bg-transparent text-[#a98c88]'}`}>{label}</button>
  )
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex w-fit gap-1 rounded-xl border border-white/[0.08] p-1">{tab('paste', 'Pegar texto')}{tab('file', 'Adjuntar PDF o Word')}</div>
      {mode === 'file' && (
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'extract'}
                  className="flex h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/[0.08] bg-[#2a0f1a] text-[13px] text-[#a98c88] hover:border-[rgba(232,70,122,0.6)] hover:text-[#e8467a] cursor-pointer">
            {busy === 'extract' ? <><Spinner /> Leyendo el documento…</> : fileName ? `${fileName} — cambiar archivo` : 'Sube un PDF o .docx (máx. 4 MB)'}
          </button>
          {text && <p className="text-[12px] text-[#a98c88]">Este es el texto que extrajimos. Revísalo y corrígelo si hace falta.</p>}
        </div>
      )}
      {(mode === 'paste' || text) && (
        <textarea className="jr-field min-h-[320px] w-full rounded-lg p-3 text-[14px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)}
                  aria-label="Investigación de mercado" placeholder="Pega aquí tu investigación: público, dolores, deseos, objeciones, testimonios reales, ingredientes, cómo se usa…" />
      )}
      <ErrorBox msg={error} />
      <button type="button" onClick={submit} disabled={!text.trim() || !!busy} className={btnPrimary}>{busy === 'save' ? <><Spinner />Guardando…</> : 'Continuar'}</button>
    </div>
  )
}

// ─── Paso 3: imagen ─────────────────────────────────────────────────────────────

function ImageStep({ session, ensure, setSession, next }: StepProps) {
  const [img, setImg] = useState(session?.inputs.productImageUrl ?? null)
  const [proof, setProof] = useState<string[]>(session?.inputs.proofImageUrls ?? [])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(label: string, fn: (id: string) => Promise<void>) {
    setBusy(label); setError(null)
    try { await fn((await ensure()).id) } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  async function submit() {
    await run('save', async (id) => {
      const { session: out } = await api.patch(id, { inputs: { productImageUrl: img, proofImageUrls: proof } })
      setSession(out); next()
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <FileUpload label={busy === 'img' ? 'Subiendo…' : 'Sube la foto o mockup del producto'} preview={img}
                  onFile={(f) => run('img', async (id) => setImg((await uploadFile(id, f, 'image')).url))} />
      <div className="flex gap-2">
        <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…o pega la URL de la imagen (https://)" aria-label="URL de la imagen" />
        <button type="button" disabled={!url.trim() || !!busy} className={`${btnGhost} shrink-0`}
                onClick={() => run('img', async (id) => { setImg((await importImageUrl(id, url.trim())).url); setUrl('') })}>Usar URL</button>
      </div>

      <details className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3" open={proof.length > 0}>
        <summary className="cursor-pointer select-none text-[13px] font-semibold text-[#efe7e0]">
          Fotos reales de antes y después <span className="font-normal text-[#a98c88]">(opcional — sin ellas no se genera esa sección)</span>
        </summary>
        <div className="flex flex-wrap gap-3 pt-4">
          {proof.map((u) => (
            <div key={u} className="relative">
              <img src={u} alt="Foto de antes/después" className="h-28 w-20 rounded-lg object-cover" />
              <button type="button" aria-label="Quitar foto" onClick={() => setProof((p) => p.filter((x) => x !== u))}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-0 bg-black/70 text-white cursor-pointer"><X className="h-3 w-3" /></button>
            </div>
          ))}
          {proof.length < 2 && (
            <div className="w-40"><FileUpload variant="ghost" label={busy === 'proof' ? 'Subiendo…' : 'Agregar foto'}
                                            onFile={(f) => run('proof', async (id) => { const u = (await uploadFile(id, f, 'image')).url; setProof((p) => [...p, u]) })} /></div>
          )}
        </div>
      </details>

      <ErrorBox msg={error} />
      <button type="button" onClick={submit} disabled={!img || !!busy} className={btnPrimary}>{busy === 'save' ? <><Spinner />Guardando…</> : 'Continuar'}</button>
    </div>
  )
}

// ─── Paso 4: análisis y sistema visual ─────────────────────────────────────────

function AnalysisStep({ session, setSession, next }: StepProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const vs = session?.visualSystem

  async function analyze() {
    if (!session) return
    setBusy(true); setError(null)
    try { setSession((await api.post(session.id, 'analyze')).session) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  useEffect(() => {
    if (started.current || !session || session.visualSystem) return
    started.current = true
    analyze()
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  if (busy || (!vs && !error)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-14 text-center" aria-live="polite">
        <Spinner />
        <p className="text-[14px] text-[#efe7e0]">Analizando tu producto y tu marca…</p>
        <p className="text-[12px] text-[#a98c88]">Puede tardar hasta un minuto si definimos también a la persona de la campaña.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      {vs && (
        <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex flex-wrap gap-3">
            {vs.palette.map((c, k) => (
              <div key={k} className="flex flex-col items-center gap-1.5">
                <span className="h-12 w-12 rounded-xl border border-white/10" style={{ background: c.hex }} />
                <span className="font-mono text-[10px] text-[#a98c88]">{c.hex}</span>
              </div>
            ))}
          </div>
          <dl className="grid gap-3 text-[13px] sm:grid-cols-[140px_1fr]">
            <dt className="font-semibold text-[#efe7e0]">Nicho</dt><dd className="text-[#c9b4ae]">{NICHE_LABELS[vs.niche]}</dd>
            <dt className="font-semibold text-[#efe7e0]">Tipografía</dt><dd className="text-[#c9b4ae]">{vs.typography}</dd>
            <dt className="font-semibold text-[#efe7e0]">Fotografía</dt><dd className="text-[#c9b4ae]">{vs.photography}</dd>
            <dt className="font-semibold text-[#efe7e0]">Dirección de arte</dt><dd className="text-[#c9b4ae]">{vs.artDirection}</dd>
          </dl>
          {vs.talentUrl && (
            <div className="flex items-center gap-3">
              <img src={vs.talentUrl} alt="Persona de la campaña" className="h-20 w-16 rounded-lg object-cover" />
              <p className="text-[12px] text-[#a98c88]">La misma persona aparece en las secciones donde la dirección de arte la usa.</p>
            </div>
          )}
        </div>
      )}
      <ErrorBox msg={error} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={next} disabled={!vs} className={btnPrimary}>Continuar</button>
        <button type="button" onClick={analyze} className={`${btnGhost} sm:w-auto`}><RefreshCw className="h-4 w-4" /> Volver a analizar</button>
      </div>
    </div>
  )
}

// ─── Paso 5: secciones ─────────────────────────────────────────────────────────

function SectionsStep({ session, setSession, next }: StepProps) {
  const [sel, setSel] = useState<string[]>(session?.selected ?? SECTIONS.map((s) => s.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!session) return null

  async function submit() {
    setBusy(true); setError(null)
    try { setSession((await api.patch(session!.id, { selected: SECTIONS.map((s) => s.id).filter((id) => sel.includes(id)) })).session); next() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {SECTIONS.map((s) => {
          const sup = sectionSupport(session, s.id)
          const on = sel.includes(s.id)
          return (
            <li key={s.id}>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${on ? 'border-white/[0.14] bg-white/[0.04]' : 'border-white/[0.06] bg-transparent'}`}>
                <input type="checkbox" checked={on} onChange={() => setSel((x) => (on ? x.filter((y) => y !== s.id) : [...x, s.id]))} className="mt-1 accent-[#bd1347]" />
                <span className="flex flex-col gap-1">
                  <span className="text-[14px] font-semibold text-[#efe7e0]">{s.wf}. {s.es}</span>
                  {!sup.ok && (
                    <span className="flex items-start gap-1.5 text-[12px] text-[#e8b86a]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {sup.reason} {sup.suggest && `Te sugerimos «${SECTION_BY_ID[sup.suggest].es}» en su lugar.`} Si la dejas marcada, se salta.
                    </span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
      </ol>
      <ErrorBox msg={error} />
      <button type="button" onClick={submit} disabled={!sel.length || busy} className={btnPrimary}>{busy ? <><Spinner />Guardando…</> : 'Continuar'}</button>
    </div>
  )
}
