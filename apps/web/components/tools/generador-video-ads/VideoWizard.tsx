'use client'

import { useEffect, useRef } from 'react'
import { useVideoStore, SESSION_KEY } from '@/store/video'
import type { VideoSessionResponse } from '@/lib/video-ads/types'
import { fetchRegens } from '@/lib/gen-quota-client'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import StepWizard from '@/components/tools/ui/StepWizard'
import Section0Mode from './sections/Section0Mode'
import Section1Source from './sections/Section1Source'
import Section2Product from './sections/Section2Product'
import Section3Script from './sections/Section3Script'
import Section4Video from './sections/Section4Video'

const SECTIONS = [Section0Mode, Section1Source, Section2Product, Section3Script, Section4Video]

// Copia del riel según la línea elegida. El esqueleto de 5 pasos no cambia: solo
// cambia qué pide el paso 1 (video de referencia · foto de personaje · brief).
const SOURCE_STEP = {
  'video-ref': {
    label: 'Referencia',
    title: 'Sube el video que quieres emular',
    hint: 'Lo desglosamos segundo a segundo: qué se ve, qué se dice y cómo está armado. De ahí sale la plantilla de tu guión. Tiene que ser vertical.',
  },
  'character-ref': {
    label: 'Personaje',
    title: '¿Quién habla a cámara?',
    hint: 'Sube la foto de la persona que aparecerá en el video. Tiene que ser vertical, y con buena luz funciona mejor.',
  },
  'character-gen': {
    label: 'Personaje',
    title: 'Diseñemos a tu creador',
    hint: 'Describe a la persona que quieres ver en cámara y la generamos.',
  },
  null: { label: 'Fuente', title: 'Elige una línea primero', hint: '' },
} as const

export default function VideoWizard() {
  const {
    step, mode, videoUrl, sessionId, sessionError,
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

  if (sessionError && !sessionId) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0c0c0d]">
        <SessionErrorRetry onRetry={startNewSession} />
      </div>
    )
  }

  const steps = [
    {
      label: 'Formato',
      title: '¿Con qué vas a arrancar?',
      hint: 'Tres caminos al mismo video. Elige el que tengas a mano.',
    },
    SOURCE_STEP[mode ?? 'null'],
    {
      label: 'Producto',
      title: '¿Qué estás vendiendo?',
      hint: 'La foto del producto entra tal cual al video, así que sube la mejor que tengas. Esta no hace falta que sea vertical.',
    },
    {
      label: 'Guión',
      title: 'Elige tu versión',
      hint: 'Dos formas de decir lo mismo. Quédate con la que suene a tu marca.',
    },
    {
      label: 'Video',
      title: videoUrl ? 'Tu video está listo' : 'Generemos tu video',
      hint: videoUrl
        ? 'Descárgalo, o pide una variación si quieres probar otro camino.'
        : 'Toma unos minutos. Puedes dejar la pestaña abierta.',
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
      backHref="/tools/generador-video-ads"
      onReset={startNewSession}
    >
      <div key={sessionId ?? 'new'}>
        <Section />
      </div>
    </StepWizard>
  )
}
