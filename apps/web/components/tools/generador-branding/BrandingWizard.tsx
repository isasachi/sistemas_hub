'use client'

import { useEffect, useRef } from 'react'
import { useBrandingStore, SESSION_KEY } from '@/store/branding'
import type { BrandingSessionResponse } from '@/lib/branding/types'
import { fetchRegens } from '@/lib/gen-quota-client'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import AccordionSection from '@/components/tools/generador-anuncios/AccordionSection'
import Section1Brief from './sections/Section1Brief'
import Section2Direction from './sections/Section2Direction'
import Section3Logo from './sections/Section3Logo'
import Section4Label from './sections/Section4Label'
import Section5Mockup from './sections/Section5Mockup'
import Section6Guide from './sections/Section6Guide'

// `maxStep` = paso más avanzado alcanzado; una sección ya visitada queda 'completed'
// (reabrible) aunque retrocedas, para navegar adelante/atrás sin reenviar (re-quemar LLM).
function getStatus(sectionStep: number, currentStep: number, maxStep: number): 'locked' | 'active' | 'completed' {
  if (currentStep === sectionStep) return 'active'
  if (maxStep > sectionStep) return 'completed'
  return 'locked'
}

export default function BrandingWizard() {
  const { step, sessionId, sessionError, startNewSession, hydrateFromSession, setStep, setRegens, brandName, productCategory, direction, logoUrl, labelUrl, mockupUrl } =
    useBrandingStore()

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

  const progressPct = Math.round((Math.min(step, 5) / 5) * 100)

  if (sessionError && !sessionId) {
    return (
      <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
        <SessionErrorRetry onRetry={startNewSession} />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
      {/* Progress bar */}
      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#ff9c4d,#ff9c4d)' }}
        />
      </div>

      {/* key por sesión: una sesión nueva remonta las secciones → su useState local
          (sembrado del store) se reinicia y no arrastra datos de la sesión anterior. */}
      <div key={sessionId ?? 'new'} className="flex-1 max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-3">
        {/* 1 — Brief */}
        <AccordionSection
          index={1}
          title="Tu marca"
          status={getStatus(0, step, maxStep.current)}
          summary={brandName && productCategory ? `${brandName} · ${productCategory}` : undefined}
          onReopen={() => setStep(0)}
        >
          <Section1Brief />
        </AccordionSection>

        {/* 2 — Dirección (gate de aprobación) */}
        <AccordionSection
          index={2}
          title="Dirección de marca"
          status={getStatus(1, step, maxStep.current)}
          summary={direction ? direction.concept : undefined}
          onReopen={() => setStep(1)}
        >
          <Section2Direction />
        </AccordionSection>

        {/* 3 — Logo */}
        <AccordionSection
          index={3}
          title="Logo"
          status={getStatus(2, step, maxStep.current)}
          summary={logoUrl ? 'Logo elegido' : undefined}
          onReopen={() => setStep(2)}
        >
          <Section3Logo />
        </AccordionSection>

        {/* 4 — Etiqueta */}
        <AccordionSection
          index={4}
          title="Etiqueta"
          status={getStatus(3, step, maxStep.current)}
          summary={labelUrl ? 'Etiqueta lista' : undefined}
          onReopen={() => setStep(3)}
        >
          <Section4Label />
        </AccordionSection>

        {/* 5 — Mockup */}
        <AccordionSection
          index={5}
          title="Mockup del producto"
          status={getStatus(4, step, maxStep.current)}
          summary={mockupUrl ? 'Mockup listo' : undefined}
          onReopen={() => setStep(4)}
        >
          <Section5Mockup />
        </AccordionSection>

        {/* 6 — Guía de marca (final): reabrible una vez alcanzada (maxStep) */}
        <AccordionSection
          index={6}
          title={mockupUrl ? '¡Tu marca está lista!' : 'Guía de marca'}
          status={step === 5 ? 'active' : maxStep.current >= 5 ? 'completed' : 'locked'}
          summary={mockupUrl ? 'Marca lista' : undefined}
          onReopen={() => setStep(5)}
        >
          <Section6Guide />
        </AccordionSection>
      </div>
    </div>
  )
}
