'use client'

import { useEffect, useRef } from 'react'
import { useWizardStore, SESSION_KEY } from '@/store/wizard'
import type { SessionResponse } from '@/lib/types'
import { fetchRegens } from '@/lib/gen-quota-client'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import AccordionSection from './AccordionSection'
import Section1Reference from './sections/Section1Reference'
import Section2Product from './sections/Section2Product'
import Section3Comments from './sections/Section3Comments'
import Section4Copy from './sections/Section4Copy'
import Section5Generate from './sections/Section5Generate'

// `maxStep` = paso más avanzado alcanzado; una sección ya visitada queda 'completed'
// (reabrible) aunque retrocedas, para navegar adelante/atrás sin reenviar (re-quemar LLM).
function getStatus(sectionStep: number, currentStep: number, maxStep: number): 'locked' | 'active' | 'completed' {
  if (currentStep === sectionStep) return 'active'
  if (maxStep > sectionStep) return 'completed'
  return 'locked'
}

export default function AdWizard() {
  const { step, imageUrl, sessionId, sessionError, startNewSession, hydrateFromSession, setStep, setRegens, referenceAnalysis, productName, targetAudience, confirmedCopy } = useWizardStore()

  // Reanudar: si hay un id guardado y la sesión existe, rehidratar; si no, una nueva.
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) { startNewSession(); return }
    fetch(`/api/generador-anuncios/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<SessionResponse>) : Promise.reject()))
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

  const progressPct = Math.round((Math.min(step, 4) / 4) * 100)

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
        {/* Section 1 */}
        <AccordionSection
          index={1}
          title="Anuncio de referencia"
          status={getStatus(0, step, maxStep.current)}
          summary={referenceAnalysis ? `${referenceAnalysis.format.ratio} · ${referenceAnalysis.format.platform} · ${referenceAnalysis.style}` : undefined}
          onReopen={() => setStep(0)}
        >
          <Section1Reference />
        </AccordionSection>

        {/* Section 2 */}
        <AccordionSection
          index={2}
          title="Producto + información"
          status={getStatus(1, step, maxStep.current)}
          summary={productName && targetAudience ? `${productName} · ${targetAudience}` : undefined}
          onReopen={() => setStep(1)}
        >
          <Section2Product />
        </AccordionSection>

        {/* Section 3 */}
        <AccordionSection
          index={3}
          title="Comentarios de TikTok"
          status={getStatus(2, step, maxStep.current)}
          summary={step >= 3 ? 'Copy A/B generado' : undefined}
          onReopen={() => setStep(2)}
        >
          <Section3Comments />
        </AccordionSection>

        {/* Section 4 */}
        <AccordionSection
          index={4}
          title="Elegir versión de copy"
          status={getStatus(3, step, maxStep.current)}
          summary={confirmedCopy ? `Versión ${confirmedCopy.version} confirmada` : undefined}
          onReopen={() => setStep(3)}
        >
          <Section4Copy />
        </AccordionSection>

        {/* Section 5 — terminal: reabrible una vez alcanzada (maxStep) */}
        <AccordionSection
          index={5}
          title={imageUrl ? '¡Anuncio listo!' : 'Generar anuncio'}
          status={step === 4 ? 'active' : maxStep.current >= 4 ? 'completed' : 'locked'}
          summary={imageUrl ? 'Anuncio generado' : undefined}
          onReopen={() => setStep(4)}
        >
          <Section5Generate />
        </AccordionSection>
      </div>
    </div>
  )
}
