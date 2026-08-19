'use client'

import { useEffect, useRef, useState } from 'react'
import { useLandingStore } from '@/store/landing'
import { NicheId, DemographicId, BodyFocus, type LandingDna, type NicheClassification } from '@/lib/landing/types'
import { NICHE_LABELS, NICHE_DEFAULT_DEMOGRAPHIC } from '@/lib/landing/niches'
import { DEMOGRAPHIC_LABELS, BODY_FOCUS_LABELS } from '@/lib/landing/demographics'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2 h-11 w-full'
const btnGhost =
  'h-10 px-4 rounded-xl border border-white/[0.14] text-[#efe7e0] text-[13px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent'
const field = 'jr-field rounded-xl px-3 py-2 text-[13px] w-full'
const lbl = 'text-[11px] uppercase tracking-wide text-[#a98c88]'

// Paso Identidad (spec 2026-07-23, 0.a): clasificación automática → preselección editable
// (niche_id/demographic_id) → confirmación → extracción del ADN visual (0.b) → display
// de solo lectura. El usuario nunca categoriza desde cero, solo confirma o corrige.

export default function SectionIdentity() {
  const {
    sessionId, step, sections, productName,
    nicheId, demographicId, bodyFocus, landingDna, talentUrl,
    setNicheId, setDemographicId, setBodyFocus, setLandingDna, setTalentUrl, confirmIdentity,
  } = useLandingStore()

  // Resultado crudo de /classify — solo para mostrar confianza/razonamiento la primera vez.
  const [classification, setClassification] = useState<NicheClassification | null>(null)
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)

  // Selección editable (no confirmada hasta el botón "Confirmar identidad visual").
  const [selNiche, setSelNiche] = useState<NicheId | null>(nicheId)
  const [selDemo, setSelDemo] = useState<DemographicId | null>(demographicId)
  const [selFocus, setSelFocus] = useState<BodyFocus | null>(bodyFocus)
  const [nicheOpen, setNicheOpen] = useState(false)
  // La placa de zona se pidió y no salió → las secciones van a mostrar el rostro. Ver más abajo.
  const [zoneMissing, setZoneMissing] = useState(false)
  // Aviso de cambio de nicho (spec Paso 3): nicho candidato mientras se confirma la advertencia.
  const [pendingNiche, setPendingNiche] = useState<NicheId | null>(null)
  // Mismo aviso para demografía: también invalida landing_dna (model_persona/poses derivan de ella).
  const [pendingDemo, setPendingDemo] = useState<DemographicId | null>(null)

  const [editing, setEditing] = useState(!landingDna)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Paso 1: clasificación automática al entrar, solo si aún no hay nicho confirmado.
  //
  // ⚠️ El guard va en un REF, no en estado. Con estado no alcanza: StrictMode invoca el efecto dos
  // veces con el MISMO snapshot, así que `classifying` sigue en false en la segunda pasada y las
  // dos llamadas salen. Medido: dos POST concurrentes clasifican las dos (Gemini pagado dos veces)
  // y devuelven resultados distintos. El servidor ya no deja que eso corrompa la sesión (claim
  // atómico), pero la llamada de más igual se paga — esto la evita en el origen.
  const yaClasifico = useRef(false)
  useEffect(() => {
    if (step !== 2 || !sessionId || nicheId || classification || classifying || yaClasifico.current) return
    yaClasifico.current = true
    setClassifying(true)
    setClassifyError(null)
    fetch(`/api/generador-landing/sessions/${sessionId}/classify`, { method: 'POST' })
      .then(async (r) => {
        const data = (await r.json()) as NicheClassification & { error?: string }
        if (!r.ok) throw new Error(data.error ?? 'No se pudo clasificar el producto')
        setClassification(data)
        setSelNiche(data.niche_id)
        setSelDemo(data.demographic_id)
        setSelFocus(data.body_focus ?? null)
        setNicheOpen(data.confidence < 0.75)
      })
      .catch((e) => setClassifyError((e as Error).message))
      .finally(() => setClassifying(false))
  }, [step, sessionId, nicheId, classification, classifying])

  // Paso 2: el usuario elige un nicho distinto. Si ya hay secciones generadas, primero pide
  // confirmación (se pierde paleta/tipografía/partículas/props) antes de aplicar el cambio.
  function pickNiche(n: NicheId) {
    const risky = !!nicheId && n !== nicheId && sections.length > 0
    if (risky) { setPendingNiche(n); return }
    setSelNiche(n)
    setPendingNiche(null)
  }
  function confirmNicheChange() {
    if (!pendingNiche) return
    setSelNiche(pendingNiche)
    setPendingNiche(null)
  }
  function cancelNicheChange() { setPendingNiche(null) }

  // Paso 2b: mismo flujo de advertencia para la demografía — también invalida el ADN (el retrato
  // de talento y las poses dependen de ella), así que amerita la misma pausa de confirmación.
  function pickDemo(d: DemographicId) {
    const risky = !!demographicId && d !== demographicId && sections.length > 0
    if (risky) { setPendingDemo(d); return }
    setSelDemo(d)
    setPendingDemo(null)
  }
  function confirmDemoChange() {
    if (!pendingDemo) return
    setSelDemo(pendingDemo)
    setPendingDemo(null)
  }
  function cancelDemoChange() { setPendingDemo(null) }

  // Paso 3: persiste (PUT), extrae el ADN si hace falta (POST) y genera el talento SOLO si hace
  // falta (POST) — nunca incondicional: regenerar el retrato sin motivo rompe "misma persona en
  // las 8 secciones" (nueva cara sobre secciones ya generadas con la anterior) y gasta una gen de
  // imagen de balde. El PUT devuelve nicheChanged/demographicChanged: si cambió algo, el server ya
  // nulificó landing_dna (nueva persona → hay que regenerar el retrato); si no cambió nada,
  // landing_dna se reusa (idempotente) y el retrato existente sigue siendo válido.
  async function confirmAndExtract() {
    if (!sessionId || !selNiche || !selDemo || saving) return
    setSaving(true)
    setError(null)
    try {
      const putRes = await fetch(`/api/generador-landing/sessions/${sessionId}/brand`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche_id: selNiche, demographic_id: selDemo, body_focus: selFocus }),
      })
      const putData = (await putRes.json()) as {
        landing_dna?: LandingDna | null
        nicheChanged?: boolean
        demographicChanged?: boolean
        focusChanged?: boolean
        error?: string
      }
      if (!putRes.ok) throw new Error(putData.error ?? 'No se pudo guardar la identidad')
      setNicheId(selNiche)
      setDemographicId(selDemo)
      setBodyFocus(selFocus)
      let dna = putData.landing_dna ?? null
      setLandingDna(dna)

      const changed = !!putData.nicheChanged || !!putData.demographicChanged || !!putData.focusChanged
      // Limpia la cara vieja de inmediato para que la UI no la muestre mientras se regenera.
      if (changed) setTalentUrl(null)

      if (!dna) {
        const extractRes = await fetch(`/api/generador-landing/sessions/${sessionId}/brand`, { method: 'POST' })
        const extractData = (await extractRes.json()) as { landing_dna?: LandingDna; error?: string }
        if (!extractRes.ok) throw new Error(extractData.error ?? 'No se pudo extraer la identidad visual')
        dna = extractData.landing_dna ?? null
        setLandingDna(dna)
      }

      // Solo regenera el talento si algo cambió (nueva persona requerida) o si aún no existe
      // retrato (primera confirmación). Si nada cambió y ya hay retrato, se reusa tal cual.
      if (changed || !talentUrl) {
        const talentRes = await fetch(`/api/generador-landing/sessions/${sessionId}/talent`, { method: 'POST' })
        const talentData = (await talentRes.json()) as { talentUrl?: string | null; zoneUrl?: string | null; zoneExpected?: boolean; error?: string }
        if (!talentRes.ok) throw new Error(talentData.error ?? 'No se pudo generar el talento')
        setTalentUrl(talentData.talentUrl ?? null)
        // La placa de zona falla sola (los filtros de contenido rechazan encuadres de cuerpo sin
        // rostro) y su fallo NO tumba la generación. Pero sin avisar, las secciones caen al retrato
        // y el usuario ve caras donde pidió una zona, sin ninguna señal de por qué.
        setZoneMissing(!!talentData.zoneExpected && !talentData.zoneUrl)
      }

      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!sessionId) return null

  if (classifying && !classification && !nicheId) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-[#c9b4ae]">
        <span className="w-6 h-6 border-2 border-white/20 border-t-[#e8467a] rounded-full animate-spin" />
        <p className="text-[13px]">Clasificando tu producto…</p>
      </div>
    )
  }

  if (classifyError && !selNiche) {
    return (
      <div className="flex flex-col gap-3 py-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{classifyError}</div>
        <button onClick={() => { setClassifyError(null); setClassification(null) }} className={btnGhost}>↻ Reintentar</button>
      </div>
    )
  }

  // Modo lectura: identidad ya confirmada y ADN extraído para el nicho/demografía actuales.
  if (!editing && landingDna) {
    return (
      <DnaDisplay
        dna={landingDna}
        demographicId={demographicId}
        talentUrl={talentUrl}
        onChangeClick={() => setEditing(true)}
        onContinue={confirmIdentity}
      />
    )
  }

  const activeNiche = selNiche ?? 'generic'
  const activeDemo = selDemo ?? NICHE_DEFAULT_DEMOGRAPHIC[activeNiche]

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-[#c9b4ae]">
        Confirma el nicho y la demografía de <strong className="text-[#efe7e0]">{productName || 'tu producto'}</strong> — de ahí sale toda la identidad visual (paleta, partículas, props y el talento) para todas las secciones.
      </p>

      {classification?.reasoning && nicheOpen && (
        <p className="text-[12px] text-[#a98c88] italic">&ldquo;{classification.reasoning}&rdquo;</p>
      )}

      {/* Nicho */}
      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Nicho</span>
        {!nicheOpen ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-lg border border-[#e8467a]/30 bg-[#e8467a]/10 px-3 py-1.5 text-[13px] text-[#efe7e0]">
              {NICHE_LABELS[activeNiche]}
            </span>
            {classification && (
              <span className="text-[11px] text-[#a98c88]">confianza {Math.round(classification.confidence * 100)}%</span>
            )}
            <button
              type="button"
              onClick={() => setNicheOpen(true)}
              className="text-[12px] text-[#e8467a] underline underline-offset-2 cursor-pointer bg-transparent border-0"
            >cambiar</button>
          </div>
        ) : (
          <select
            value={pendingNiche ?? activeNiche}
            onChange={(e) => pickNiche(NicheId.parse(e.target.value))}
            className={field}
          >
            {NicheId.options.map((n) => <option key={n} value={n}>{NICHE_LABELS[n]}</option>)}
          </select>
        )}
      </div>

      {pendingNiche && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-300 flex flex-col gap-2">
          <p>Ya generaste secciones con el nicho anterior. Cambiar de nicho invalidará la paleta, la tipografía, las partículas y los props — vas a tener que regenerar desde la sección ancla.</p>
          <div className="flex gap-2">
            <button type="button" onClick={confirmNicheChange} className={btnGhost}>Sí, cambiar de nicho</button>
            <button type="button" onClick={cancelNicheChange} className={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Demografía — siempre editable, default = valor actual o el del nicho */}
      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Demografía del comprador</span>
        <select
          value={pendingDemo ?? activeDemo}
          onChange={(e) => pickDemo(DemographicId.parse(e.target.value))}
          className={field}
        >
          {DemographicId.options.map((d) => <option key={d} value={d}>{DEMOGRAPHIC_LABELS[d]}</option>)}
        </select>
      </div>

      {/* Zona del cuerpo — decide el encuadre del talento en las secciones que no son el hero.
          Sin aviso de confirmación: cambiarla no cambia la PERSONA (que es lo caro de perder),
          solo qué parte de ella se muestra, y el server ya invalida el ADN y la placa de zona. */}
      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Zona que muestra el producto</span>
        <select
          value={selFocus ?? 'rostro'}
          onChange={(e) => setSelFocus(BodyFocus.parse(e.target.value))}
          className={field}
        >
          {BodyFocus.options.map((f) => <option key={f} value={f}>{BODY_FOCUS_LABELS[f]}</option>)}
        </select>
        <p className="text-[11px] text-[#94a3b8]">
          El hero siempre muestra el rostro; el resto de las secciones encuadran esta zona.
        </p>
      </div>

      {pendingDemo && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-300 flex flex-col gap-2">
          <p>Ya generaste secciones con la demografía anterior. Cambiar de demografía invalidará la persona y las poses del talento — vas a tener que regenerar desde la sección ancla.</p>
          <div className="flex gap-2">
            <button type="button" onClick={confirmDemoChange} className={btnGhost}>Sí, cambiar de demografía</button>
            <button type="button" onClick={cancelDemoChange} className={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}

      {zoneMissing && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-300">
          No se pudo generar la foto de la zona ({BODY_FOCUS_LABELS[selFocus ?? 'rostro']}); las secciones van a mostrar el retrato en su lugar. Vuelve a confirmar para reintentarlo.
        </div>
      )}

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>}

      <button onClick={confirmAndExtract} disabled={saving || !selNiche || !!pendingNiche || !!pendingDemo} className={btnPrimary}>
        {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Confirmando…</> : 'Confirmar identidad visual'}
      </button>
    </div>
  )
}

// Display de solo lectura del ADN visual derivado (spec 0.b): paleta por fórmula, partículas,
// props de escena, persona y retrato de talento. Nada de esto es editable acá — para corregirlo
// hay que volver a "cambiar" (nicho/demografía) y re-confirmar.
function DnaDisplay({
  dna, demographicId, talentUrl, onChangeClick, onContinue,
}: {
  dna: LandingDna
  demographicId: DemographicId | null
  talentUrl: string | null
  onChangeClick: () => void
  onContinue: () => void
}) {
  const swatches: { label: string; hex: string }[] = [
    { label: 'Titular', hex: dna.palette.color_headline },
    { label: 'Acento', hex: dna.palette.color_accent },
    { label: 'Cuerpo', hex: dna.palette.color_body },
    { label: 'Fondo inicio', hex: dna.palette.bg_start },
    { label: 'Fondo fin', hex: dna.palette.bg_end },
    ...dna.palette.color_icon.map((hex, i) => ({ label: `Ícono ${i + 1}`, hex })),
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-[#c9b4ae]">Esta es la identidad visual derivada de tu producto. Se aplica igual en todas las secciones.</p>
        <button type="button" onClick={onChangeClick} className="text-[12px] text-[#e8467a] underline underline-offset-2 cursor-pointer bg-transparent border-0 shrink-0">cambiar</button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Paleta</span>
        <div className="flex flex-wrap gap-2">
          {swatches.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#2a0f1a] px-2 py-1.5">
              <span className="w-5 h-5 rounded-md border border-white/[0.14] shrink-0" style={{ background: s.hex }} />
              <span className="text-[11px] text-[#c9b4ae]">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Partículas</span>
        <p className="text-[13px] text-[#efe7e0]">{dna.particle_type} <span className="text-[11px] text-[#a98c88]">· densidad {dna.particle_density}</span></p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Props de escena</span>
        <div className="flex flex-wrap gap-1.5">
          {dna.props.map((p) => (
            <span key={p} className="rounded-lg border border-white/[0.08] bg-[#2a0f1a] px-2.5 py-1 text-[12px] text-[#c9b4ae]">{p}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={lbl}>Persona / talento</span>
        {demographicId === 'no_talent' ? (
          <p className="text-[13px] text-[#a98c88]">Sin persona — el producto sale solo / con sustituto.</p>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-[#2a0f1a] p-3">
            <div className="w-24 h-32 rounded-lg overflow-hidden bg-[#0c0c0d] border border-white/[0.06] shrink-0 flex items-center justify-center">
              {talentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={talentUrl} alt="Talento de la campaña" className="w-full h-full object-cover" />
              ) : (
                <span className="w-5 h-5 border-2 border-white/20 border-t-[#e8467a] rounded-full animate-spin" />
              )}
            </div>
            <p className="text-[12px] text-[#c9b4ae] flex-1">{dna.model_persona}</p>
          </div>
        )}
      </div>

      <button onClick={onContinue} className={btnPrimary}>Continuar a Confianza y pagos</button>
    </div>
  )
}
