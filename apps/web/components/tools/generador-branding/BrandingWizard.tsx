'use client'

import { useEffect } from 'react'
import { useBrandingStore, SESSION_KEY } from '@/store/branding'
import type { BrandingSessionResponse } from '@/lib/branding/types'
import AccordionSection from '@/components/tools/generador-anuncios/AccordionSection'
import Section1Brief from './sections/Section1Brief'
import Section2Direction from './sections/Section2Direction'
import Section3Logo from './sections/Section3Logo'
import Section4Label from './sections/Section4Label'
import Section5Mockup from './sections/Section5Mockup'
import Section6Guide from './sections/Section6Guide'

function getStatus(sectionStep: number, currentStep: number): 'locked' | 'active' | 'completed' {
  if (currentStep >= sectionStep + 1) return 'completed'
  if (currentStep === sectionStep) return 'active'
  return 'locked'
}

export default function BrandingWizard() {
  const { step, startNewSession, hydrateFromSession, setStep, brandName, productCategory, direction, logoUrl, labelUrl, mockupUrl } =
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

  const progressPct = Math.round((Math.min(step, 5) / 5) * 100)

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a]">
      {/* Progress bar */}
      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#ff9c4d,#ff9c4d)' }}
        />
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-3">
        {/* 1 — Brief */}
        <AccordionSection
          index={1}
          title="Tu marca"
          status={getStatus(0, step)}
          summary={brandName && productCategory ? `${brandName} · ${productCategory}` : undefined}
          onReopen={() => setStep(0)}
        >
          <Section1Brief />
        </AccordionSection>

        {/* 2 — Dirección (gate de aprobación) */}
        <AccordionSection
          index={2}
          title="Dirección de marca"
          status={getStatus(1, step)}
          summary={direction ? direction.concept : undefined}
          onReopen={() => setStep(1)}
        >
          <Section2Direction />
        </AccordionSection>

        {/* 3 — Logo */}
        <AccordionSection
          index={3}
          title="Logo"
          status={getStatus(2, step)}
          summary={logoUrl ? 'Logo elegido' : undefined}
          onReopen={() => setStep(2)}
        >
          <Section3Logo />
        </AccordionSection>

        {/* 4 — Etiqueta */}
        <AccordionSection
          index={4}
          title="Etiqueta"
          status={getStatus(3, step)}
          summary={labelUrl ? 'Etiqueta lista' : undefined}
          onReopen={() => setStep(3)}
        >
          <Section4Label />
        </AccordionSection>

        {/* 5 — Mockup */}
        <AccordionSection
          index={5}
          title="Mockup del producto"
          status={getStatus(4, step)}
          summary={mockupUrl ? 'Mockup listo' : undefined}
          onReopen={() => setStep(4)}
        >
          <Section5Mockup />
        </AccordionSection>

        {/* 6 — Guía de marca (final, no colapsa) */}
        <AccordionSection
          index={6}
          title={mockupUrl ? '¡Tu marca está lista!' : 'Guía de marca'}
          status={step >= 5 ? 'active' : 'locked'}
        >
          <Section6Guide />
        </AccordionSection>
      </div>
    </div>
  )
}
