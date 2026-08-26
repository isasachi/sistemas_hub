'use client'

import { useEffect, useRef } from 'react'
import { useWizardStore, SESSION_KEY } from '@/store/wizard'
import type { SessionResponse } from '@/lib/types'
import { fetchRegens } from '@/lib/gen-quota-client'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import StepWizard from '@/components/tools/ui/StepWizard'
import Section1Reference from './sections/Section1Reference'
import Section2Product from './sections/Section2Product'
import Section3Comments from './sections/Section3Comments'
import Section4Copy from './sections/Section4Copy'
import Section5Generate from './sections/Section5Generate'

// Una pantalla por paso. El shell NO trae "Siguiente": cada sección tiene su
// propio botón de enviar-y-avanzar, y un Siguiente genérico volvería a disparar
// la llamada al modelo cada vez que navegaras.
const SECTIONS = [Section1Reference, Section2Product, Section3Comments, Section4Copy, Section5Generate]

export default function AdWizard() {
  const {
    step, imageUrl, sessionId, sessionError,
    startNewSession, hydrateFromSession, setStep, setRegens,
  } = useWizardStore()

  // Reanudar: si hay un id guardado y la sesión existe, rehidratar; si no, una nueva.
  // ⚠️ UNA SOLA VEZ, PASE LO QUE PASE CON EL MONTAJE. Este efecto CREA una sesión en el
  // servidor, y el StrictMode de React monta dos veces en desarrollo: sin este candado se
  // crean DOS filas por visita. Medido en la base, las sesiones fantasma aparecían en
  // pareja con la real y con el mismo minuto de creación.
  const arrancado = useRef(false)

  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
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

  // `maxStep` = paso más avanzado alcanzado; hasta ahí se puede volver por el
  // riel sin reenviar nada. Se resetea al cambiar de sesión: sin esto el ref
  // persiste y una sesión nueva (step 0) dejaría todo el riel abierto.
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
      label: 'Referencia',
      title: 'Empecemos por un anuncio que te guste',
      hint: 'Sube el anuncio que quieres emular. Leemos su formato, su estilo y cómo está armado para construir el tuyo sobre esa base.',
    },
    {
      label: 'Producto',
      title: '¿Qué estás vendiendo?',
      hint: 'El producto y a quién le hablas. De ahí sale el ángulo del copy.',
    },
    {
      label: 'Comentarios',
      title: 'Lo que dice la gente',
      hint: 'Pega comentarios reales de TikTok sobre productos como el tuyo. Las objeciones y los elogios textuales son la mejor materia prima para el copy.',
    },
    {
      label: 'Copy',
      title: 'Elige tu versión',
      hint: 'Dos ángulos distintos sobre el mismo producto. Quédate con el que suene a tu marca.',
    },
    {
      label: 'Anuncio',
      title: imageUrl ? 'Tu anuncio está listo' : 'Generemos tu anuncio',
      hint: imageUrl
        ? 'Descárgalo, o pide una variación si quieres probar otro camino.'
        : 'Juntamos la referencia, el producto y el copy elegido en la imagen final.',
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
      backHref="/tools/generador-anuncios"
      onReset={startNewSession}
    >
      {/* key por sesión: una sesión nueva remonta la sección → su useState local
          (sembrado del store) se reinicia y no arrastra datos de la anterior. */}
      <div key={sessionId ?? 'new'}>
        <Section />
      </div>
    </StepWizard>
  )
}
