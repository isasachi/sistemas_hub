'use client'

import { useEffect, useRef } from 'react'
import { useLandingStore, SESSION_KEY } from '@/store/landing'
import type { LandingSessionResponse } from '@/lib/landing/types'
import { fetchRegens } from '@/lib/gen-quota-client'
import { SECTION_LABELS } from '@/lib/landing/types'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import AccordionSection from '@/components/tools/generador-anuncios/AccordionSection'
import { TYPE_PAIRS } from '@/lib/landing/typography-catalog'
import Section1Product from './sections/Section1Product'
import Section2Photos from './sections/Section2Photos'
import SectionIdentity from './sections/SectionIdentity'
import SectionTrust from './sections/SectionTrust'
import Section3Sections from './sections/Section3Sections'
import Section4Preview from './sections/Section4Preview'

// `maxStep` = paso más avanzado alcanzado; una sección ya visitada queda 'completed'
// (reabrible) aunque retrocedas, para navegar adelante/atrás sin reenviar (re-quemar LLM).
function getStatus(sectionStep: number, currentStep: number, maxStep: number): 'locked' | 'active' | 'completed' {
  if (currentStep === sectionStep) return 'active'
  if (maxStep > sectionStep) return 'completed'
  return 'locked'
}

export default function LandingWizard() {
  const { step, sessionId, sessionError, startNewSession, hydrateFromSession, setStep, setRegens, productName, productPhotoUrls, derivedBrand, trustBlock, selectedSections, sections } =
    useLandingStore()

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) { startNewSession(); return }
    fetch(`/api/generador-landing/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<LandingSessionResponse>) : Promise.reject()))
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
      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#ff9c4d,#ff7a2f)' }}
        />
      </div>

      {/* key por sesión: una sesión nueva remonta las secciones → su useState local
          (sembrado del store) se reinicia y no arrastra datos de la sesión anterior. */}
      <div key={sessionId ?? 'new'} className="flex-1 max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-3">
        <AccordionSection
          index={1}
          title="Tu producto"
          status={getStatus(0, step, maxStep.current)}
          summary={productName ?? undefined}
          onReopen={() => setStep(0)}
        >
          <Section1Product />
        </AccordionSection>

        <AccordionSection
          index={2}
          title="Fotos del producto"
          status={getStatus(1, step, maxStep.current)}
          summary={productPhotoUrls.length ? `${productPhotoUrls.length} foto(s)` : undefined}
          onReopen={() => setStep(1)}
        >
          <Section2Photos />
        </AccordionSection>

        <AccordionSection
          index={3}
          title="Identidad visual"
          status={getStatus(2, step, maxStep.current)}
          summary={derivedBrand ? `${derivedBrand.niche} · ${TYPE_PAIRS[derivedBrand.typePair].display}` : undefined}
          onReopen={() => setStep(2)}
        >
          <SectionIdentity />
        </AccordionSection>

        <AccordionSection
          index={4}
          title="Confianza y pagos"
          status={getStatus(3, step, maxStep.current)}
          summary={trustBlock ? `${trustBlock.paymentMethods.length} medios${trustBlock.codDelivery ? ' · contraentrega' : ''}${trustBlock.guaranteeDays ? ` · ${trustBlock.guaranteeDays}d garantía` : ''}` : undefined}
          onReopen={() => setStep(3)}
        >
          <SectionTrust />
        </AccordionSection>

        <AccordionSection
          index={5}
          title="Secciones de tu landing"
          status={getStatus(4, step, maxStep.current)}
          summary={selectedSections.length ? selectedSections.map((s) => SECTION_LABELS[s]).join(' · ') : undefined}
          onReopen={() => setStep(4)}
        >
          <Section3Sections />
        </AccordionSection>

        <AccordionSection
          index={6}
          title={sections.length ? '¡Tu landing está lista!' : 'Tu landing'}
          status={step === 5 ? 'active' : maxStep.current >= 5 ? 'completed' : 'locked'}
          summary={sections.length ? 'Landing lista' : undefined}
          onReopen={() => setStep(5)}
        >
          <Section4Preview />
        </AccordionSection>
      </div>
    </div>
  )
}
