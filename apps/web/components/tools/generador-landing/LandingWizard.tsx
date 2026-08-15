'use client'

import { useEffect, useRef } from 'react'
import { useLandingStore, SESSION_KEY } from '@/store/landing'
import type { LandingSessionResponse } from '@/lib/landing/types'
import { fetchRegens } from '@/lib/gen-quota-client'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import StepWizard from '@/components/tools/ui/StepWizard'
import Section1Product from './sections/Section1Product'
import Section2Photos from './sections/Section2Photos'
import SectionIdentity from './sections/SectionIdentity'
import SectionTrust from './sections/SectionTrust'
import Section3Sections from './sections/Section3Sections'
import Section4Preview from './sections/Section4Preview'

// Una pantalla por paso. Sin "Siguiente" del shell: cada sección trae su propia
// acción de enviar-y-avanzar (varias llaman al modelo al hacerlo).
const SECTIONS = [
  Section1Product,
  Section2Photos,
  SectionIdentity,
  SectionTrust,
  Section3Sections,
  Section4Preview,
]

export default function LandingWizard() {
  const {
    step, sessionId, sessionError,
    startNewSession, hydrateFromSession, setStep, setRegens, sections,
  } = useLandingStore()

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

  // `maxStep` = paso más avanzado alcanzado; hasta ahí se puede volver por el
  // riel sin reenviar nada. Se resetea al cambiar de sesión.
  const maxStep = useRef(0)
  const prevSession = useRef(sessionId)
  if (prevSession.current !== sessionId) { prevSession.current = sessionId; maxStep.current = 0 }
  maxStep.current = Math.max(maxStep.current, step)

  if (sessionError && !sessionId) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0c0c0d]">
        <SessionErrorRetry onRetry={startNewSession} />
      </div>
    )
  }

  const steps = [
    {
      label: 'Producto',
      title: '¿Qué vas a vender en esta página?',
      hint: 'El nombre y la promesa. Todo lo demás se construye a partir de ahí.',
    },
    {
      label: 'Fotos',
      title: 'Muéstranos tu producto',
      hint: 'Sube las fotos que tengas. Las usamos como referencia real para que el producto salga igual en cada sección.',
    },
    {
      label: 'Identidad',
      title: 'El mundo visual de tu marca',
      hint: 'Confirma el nicho y a quién le hablas: de ahí salen la paleta, los materiales y el talento de todas las secciones.',
    },
    {
      label: 'Confianza',
      title: '¿Cómo te pagan y qué garantizas?',
      hint: 'Medios de pago, contraentrega y garantía. Es lo que decide la compra en el último scroll.',
    },
    {
      label: 'Secciones',
      title: 'Arma tu página',
      hint: 'Elige qué secciones quieres. Puedes empezar con pocas y sumar después.',
    },
    {
      label: 'Landing',
      title: sections.length ? 'Tu landing está lista' : 'Generemos tu landing',
      hint: sections.length
        ? 'Revisa sección por sección y regenera la que no te convenza.'
        : 'Generamos cada sección con la identidad y las fotos que nos diste.',
    },
  ]

  const current = Math.min(step, steps.length - 1)
  const Section = SECTIONS[current]

  return (
    <StepWizard
      steps={steps}
      current={current}
      maxReached={maxStep.current}
      onNavigate={setStep}
      backHref="/tools/generador-landing"
      onReset={startNewSession}
      full={current === 5}
    >
      {/* key por sesión: una sesión nueva remonta la sección → su useState local
          (sembrado del store) se reinicia y no arrastra datos de la anterior. */}
      <div key={sessionId ?? 'new'} className={current === 5 ? 'mx-auto w-full max-w-[1160px] px-5 pb-16 md:px-8' : ''}>
        <Section />
      </div>
    </StepWizard>
  )
}
