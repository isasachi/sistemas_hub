'use client'

import { useEffect, useRef } from 'react'
import { useBrandingStore, SESSION_KEY } from '@/store/branding'
import type { BrandingSessionResponse } from '@/lib/branding/types'
import { STYLE_PRESETS } from '@/lib/branding/style-presets'
import type { StylePreset } from '@/lib/branding/style-presets'
import { fetchRegens } from '@/lib/gen-quota-client'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import AccordionSection from '@/components/tools/generador-anuncios/AccordionSection'
import Section1Style, { type AnalyzeResult } from './sections/Section1Style'
import Section2Brief from './sections/Section2Brief'
import Section4Marca from './sections/Section4Marca'
import Section5Guide from './sections/Section5Guide'

// Wizard de branding compose-first, identidad fija (migración fase 10). 4 secciones,
// `step` 0..3: 0 Estilo · 1 Tu marca · 2 Marca (compose→derivar, auto-orquestado) · 3 Guía (final)
// `maxStep` = paso más avanzado alcanzado; una sección ya visitada queda 'completed'
// (reabrible) aunque retrocedas, para navegar adelante/atrás sin reenviar (re-quemar LLM).
function getStatus(sectionStep: number, currentStep: number, maxStep: number): 'locked' | 'active' | 'completed' {
  if (currentStep === sectionStep) return 'active'
  if (maxStep > sectionStep) return 'completed'
  return 'locked'
}

async function patchSession(sessionId: string, patch: Record<string, unknown>) {
  try {
    const res = await fetch(`/api/generador-branding/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) console.error(`Failed to patch session ${sessionId}:`, res.status, res.statusText)
  } catch (e) {
    console.error(`Error patching session ${sessionId}:`, e)
  }
}

export default function BrandingWizard() {
  const {
    step, sessionId, sessionError, startNewSession, hydrateFromSession, setStep, setRegens,
    sourceMode, styleId, setStyle, setUploaded,
    brandName, productType,
    mockupUrl, goToGuide,
  } = useBrandingStore()

  // Reanudar: si hay un id guardado y la sesión existe, rehidratar; si no, una nueva.
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) { startNewSession(); return }
    fetch(`/api/generador-branding/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<BrandingSessionResponse>) : Promise.reject()))
      .then((s) => hydrateFromSession(s))
      .catch(() => startNewSession())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessionId) fetchRegens(sessionId).then(setRegens)
  }, [sessionId, setRegens])

  // Resetear el "paso más avanzado" al cambiar de sesión: sin esto el ref persiste y
  // una sesión nueva (step 0) deja todas las secciones abiertas/'completed'.
  const maxStep = useRef(0)
  const prevSession = useRef(sessionId)
  if (prevSession.current !== sessionId) { prevSession.current = sessionId; maxStep.current = 0 }
  maxStep.current = Math.max(maxStep.current, step)

  const progressPct = Math.round((Math.min(step, 3) / 3) * 100)

  // El `step` persistido en DB debe ser un high-water mark: nunca regresa, aunque el
  // usuario reabra una sección anterior y la reenvíe (ej. edita el brief tras ya
  // tener el mockup listo). Por eso cada PATCH que avanza de paso manda
  // Math.max(maxStep.current, N) — igual que hace `select-logo` server-side.
  async function onStyleChosen(id: string) {
    if (!sessionId) return
    await patchSession(sessionId, {
      source_mode: 'preset',
      style_id: id,
      step: Math.max(maxStep.current, 1),
    })
    setStyle({ sourceMode: 'preset', styleId: id })
  }

  async function onUploaded(r: AnalyzeResult) {
    if (sessionId) await patchSession(sessionId, { step: Math.max(maxStep.current, 1) })
    setUploaded({ styleId: r.styleId, uploadedImageUrl: r.uploadedImageUrl, imageAnalysis: r.analysis ?? null })
  }

  // "Continuar a la guía" (botón en Section4Marca, fase `done`): la derivación
  // ya fijó step:2 server-side (derive target:'both'), acá solo falta avanzar
  // a la Guía (step 3) — high-water mark, igual que el resto de pasos.
  async function onGuide() {
    if (sessionId) await patchSession(sessionId, { step: Math.max(maxStep.current, 3) })
    goToGuide()
  }

  if (sessionError && !sessionId) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
        <SessionErrorRetry onRetry={startNewSession} />
      </div>
    )
  }

  const styleSummary = styleId
    ? sourceMode === 'upload' ? 'Producto subido' : (STYLE_PRESETS as Record<string, StylePreset>)[styleId]?.name
    : undefined
  const briefSummary = brandName && productType ? `${brandName} · ${productType}` : undefined

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
      {/* Progress bar */}
      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#ff9c4d,#ff7a2f)' }}
        />
      </div>

      {/* key por sesión: una sesión nueva remonta las secciones → su useState local
          (sembrado del store) se reinicia y no arrastra datos de la sesión anterior. */}
      <div key={sessionId ?? 'new'} className="flex-1 max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-3">
        {/* 1 — Estilo */}
        <AccordionSection
          index={1}
          title="Estilo"
          status={getStatus(0, step, maxStep.current)}
          summary={styleSummary}
          onReopen={() => setStep(0)}
        >
          {sessionId && <Section1Style sessionId={sessionId} onStyleChosen={onStyleChosen} onUploaded={onUploaded} />}
        </AccordionSection>

        {/* 2 — Tu marca (brief) */}
        <AccordionSection
          index={2}
          title="Tu marca"
          status={getStatus(1, step, maxStep.current)}
          summary={briefSummary}
          onReopen={() => setStep(1)}
        >
          <Section2Brief maxStep={maxStep.current} />
        </AccordionSection>

        {/* 3 — Marca (compose→derivar, auto-orquestado) */}
        <AccordionSection
          index={3}
          title="Logo, etiqueta y mockup"
          status={getStatus(2, step, maxStep.current)}
          summary={mockupUrl ? 'Marca lista' : undefined}
          onReopen={() => setStep(2)}
        >
          <Section4Marca onGuide={onGuide} />
        </AccordionSection>

        {/* 4 — Guía de marca (final): reabrible una vez alcanzada (maxStep) */}
        <AccordionSection
          index={4}
          title={mockupUrl ? '¡Tu marca está lista!' : 'Guía de marca'}
          status={step === 3 ? 'active' : maxStep.current >= 3 ? 'completed' : 'locked'}
          summary={mockupUrl ? 'Marca lista' : undefined}
          onReopen={() => setStep(3)}
        >
          <Section5Guide />
        </AccordionSection>
      </div>
    </div>
  )
}
