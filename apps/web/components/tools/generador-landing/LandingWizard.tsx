'use client'

import { useEffect } from 'react'
import { useLandingStore, SESSION_KEY } from '@/store/landing'
import type { LandingSessionResponse } from '@/lib/landing/types'
import { SECTION_LABELS } from '@/lib/landing/types'
import AccordionSection from '@/components/tools/generador-anuncios/AccordionSection'
import Section1Product from './sections/Section1Product'
import Section2Photos from './sections/Section2Photos'
import SectionTemplate from './sections/SectionTemplate'
import Section3Sections from './sections/Section3Sections'
import Section4Preview from './sections/Section4Preview'
import { TEMPLATE_BY_ID } from '@/lib/landing/templates'

function getStatus(sectionStep: number, currentStep: number): 'locked' | 'active' | 'completed' {
  if (currentStep >= sectionStep + 1) return 'completed'
  if (currentStep === sectionStep) return 'active'
  return 'locked'
}

export default function LandingWizard() {
  const { step, startNewSession, hydrateFromSession, setStep, productName, productPhotoUrls, template, selectedSections, sections } =
    useLandingStore()

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) { startNewSession(); return }
    fetch(`/api/generador-landing/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<LandingSessionResponse>) : Promise.reject()))
      .then((s) => hydrateFromSession(s))
      .catch(() => startNewSession())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const progressPct = Math.round((Math.min(step, 4) / 4) * 100)

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#ff9c4d,#ff9c4d)' }}
        />
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-3">
        <AccordionSection
          index={1}
          title="Tu producto"
          status={getStatus(0, step)}
          summary={productName ?? undefined}
          onReopen={() => setStep(0)}
        >
          <Section1Product />
        </AccordionSection>

        <AccordionSection
          index={2}
          title="Fotos del producto"
          status={getStatus(1, step)}
          summary={productPhotoUrls.length ? `${productPhotoUrls.length} foto(s)` : undefined}
          onReopen={() => setStep(1)}
        >
          <Section2Photos />
        </AccordionSection>

        <AccordionSection
          index={3}
          title="Plantilla"
          status={getStatus(2, step)}
          summary={template ? TEMPLATE_BY_ID[template]?.label : undefined}
          onReopen={() => setStep(2)}
        >
          <SectionTemplate />
        </AccordionSection>

        <AccordionSection
          index={4}
          title="Secciones de tu landing"
          status={getStatus(3, step)}
          summary={selectedSections.length ? selectedSections.map((s) => SECTION_LABELS[s]).join(' · ') : undefined}
          onReopen={() => setStep(3)}
        >
          <Section3Sections />
        </AccordionSection>

        <AccordionSection
          index={5}
          title={sections.length ? '¡Tu landing está lista!' : 'Tu landing'}
          status={step >= 4 ? 'active' : 'locked'}
        >
          <Section4Preview />
        </AccordionSection>
      </div>
    </div>
  )
}
