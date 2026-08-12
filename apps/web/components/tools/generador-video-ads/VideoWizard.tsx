'use client'

import { useEffect, useRef } from 'react'
import { useVideoStore, SESSION_KEY } from '@/store/video'
import type { VideoSessionResponse } from '@/lib/video-ads/types'
import { capMaxReached } from '@/lib/video-ads/validation'
import { fetchRegens } from '@/lib/gen-quota-client'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import StepWizard from '@/components/tools/ui/StepWizard'
import Section0Reference from './sections/Section0Reference'
import Section1Product from './sections/Section1Product'
import Section2Character from './sections/Section2Character'
import Section3Validation from './sections/Section3Validation'
import Section4Template from './sections/Section4Template'

const SECTIONS = [Section0Reference, Section1Product, Section2Character, Section3Validation, Section4Template]

// Índice de "Validación" en `SECTIONS`/`steps`: el riel no debe dejar saltar más
// allá de acá mientras la FASE 0 tenga una crítica PENDIENTE.
const VALIDATION_STEP = 3

export default function VideoWizard() {
  const {
    step, sessionId, sessionError, validation,
    startNewSession, hydrateFromSession, setStep, setRegens,
  } = useVideoStore()

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) { startNewSession(); return }
    fetch(`/api/generador-video-ads/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<VideoSessionResponse>) : Promise.reject()))
      .then((s) => hydrateFromSession(s))
      .catch(() => startNewSession())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessionId) fetchRegens(sessionId).then(setRegens)
  }, [sessionId, setRegens])

  // `maxStep` = paso más avanzado alcanzado; hasta ahí se navega por el riel sin
  // reenviar nada. Se resetea al cambiar de sesión (mismo patrón que AdWizard).
  const maxStep = useRef(0)
  const prevSession = useRef(sessionId)
  if (prevSession.current !== sessionId) { prevSession.current = sessionId; maxStep.current = 0 }
  maxStep.current = Math.max(maxStep.current, step)

  const gatedMaxReached = capMaxReached(maxStep.current, validation, VALIDATION_STEP)

  if (sessionError && !sessionId) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0c0c0d]">
        <SessionErrorRetry onRetry={startNewSession} />
      </div>
    )
  }

  const steps = [
    {
      label: 'Referencia',
      title: 'Sube el video que quieres emular',
      hint: 'Lo desglosamos corte por corte: qué se ve, qué se dice, cómo está encuadrado y cuánto dura cada toma. Tiene que ser vertical.',
    },
    {
      label: 'Producto',
      title: '¿Qué estás vendiendo y con qué ángulo?',
      hint: 'La foto del producto entra tal cual al video. El ángulo reemplaza al del original, conservando su estructura.',
    },
    {
      label: 'Personaje',
      title: '¿Quién habla a cámara?',
      hint: 'Etnia y acento los defines tú: no los deducimos de una foto ni del video de referencia.',
    },
    {
      label: 'Validación',
      title: 'Antes de seguir, confirmemos los datos',
      hint: 'Nada se rellena por suposición. Si algo falta, el proceso se detiene acá.',
    },
    {
      label: 'Plantilla',
      title: 'El ADN del original',
      hint: 'El guión literal, los cortes reales y la plantilla Fill in the Blank que se rellenará con tu producto.',
    },
  ]

  // Capado también acá, no solo en `maxReached`: `patch({ step: 4 })` (el botón de
  // Section3Validation) y `hydrateFromSession` (el `step` de la DB, monótono) son
  // dos formas de aterrizar en "Plantilla" que NO pasan por el riel. Sin este tope,
  // invalidar la matriz después de haber llegado a "Plantilla" una vez dejaba esa
  // pantalla visible en el siguiente hidratado de sesión, aunque el riel ya no
  // dejara hacer clic ahí.
  const current = Math.min(step, gatedMaxReached, steps.length - 1)
  const Section = SECTIONS[current]

  return (
    <StepWizard
      steps={steps}
      current={current}
      maxReached={gatedMaxReached}
      onNavigate={setStep}
      backHref="/tools/generador-video-ads"
      onReset={startNewSession}
    >
      <div key={sessionId ?? 'new'}>
        <Section />
      </div>
    </StepWizard>
  )
}
