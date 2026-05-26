'use client'

import { useEffect } from 'react'
import { useWizardStore } from '@/store/wizard'
import AccordionSection from './AccordionSection'
import Section1Reference from './sections/Section1Reference'
import Section2Product from './sections/Section2Product'
import Section3Comments from './sections/Section3Comments'
import Section4Copy from './sections/Section4Copy'
import Section5Generate from './sections/Section5Generate'

function getStatus(sectionStep: number, currentStep: number): 'locked' | 'active' | 'completed' {
  if (currentStep >= sectionStep + 1) return 'completed'
  if (currentStep === sectionStep) return 'active'
  return 'locked'
}

export default function AdWizard() {
  const { step, imageUrl, startNewSession, setStep, referenceAnalysis, productName, targetAudience, confirmedCopy } = useWizardStore()

  useEffect(() => { startNewSession() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const progressPct = Math.round((Math.min(step, 4) / 4) * 100)

  return (
    <div className="flex flex-col min-h-screen bg-[#080810]">
      {/* Progress bar */}
      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#f59e0b,#ef4444)' }}
        />
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-3">
        {/* Section 1 */}
        <AccordionSection
          index={1}
          title="Anuncio de referencia"
          status={getStatus(0, step)}
          summary={referenceAnalysis ? `${referenceAnalysis.format.ratio} · ${referenceAnalysis.format.platform} · ${referenceAnalysis.style}` : undefined}
          onReopen={() => setStep(0)}
        >
          <Section1Reference />
        </AccordionSection>

        {/* Section 2 */}
        <AccordionSection
          index={2}
          title="Producto + información"
          status={getStatus(1, step)}
          summary={productName && targetAudience ? `${productName} · ${targetAudience}` : undefined}
          onReopen={() => setStep(1)}
        >
          <Section2Product />
        </AccordionSection>

        {/* Section 3 */}
        <AccordionSection
          index={3}
          title="Comentarios de TikTok"
          status={getStatus(2, step)}
          summary={step >= 3 ? 'Copy A/B generado' : undefined}
          onReopen={() => setStep(2)}
        >
          <Section3Comments />
        </AccordionSection>

        {/* Section 4 */}
        <AccordionSection
          index={4}
          title="Elegir versión de copy"
          status={getStatus(3, step)}
          summary={confirmedCopy ? `Versión ${confirmedCopy.version} confirmada` : undefined}
          onReopen={() => setStep(3)}
        >
          <Section4Copy />
        </AccordionSection>

        {/* Section 5 — stays open once reached; never collapses */}
        <AccordionSection
          index={5}
          title={imageUrl ? '¡Anuncio listo!' : 'Generar anuncio'}
          status={step >= 4 ? 'active' : 'locked'}
        >
          <Section5Generate />
        </AccordionSection>
      </div>
    </div>
  )
}
