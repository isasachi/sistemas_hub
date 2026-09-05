'use client'

import { useEffect, useRef } from 'react'
import { useWizardStore, SESSION_KEY } from '@/store/wizard'
import type { SessionResponse } from '@/lib/types'
import { STEP, PASOS_PLANTILLA } from '@/lib/anuncios/steps'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import StepWizard from '@/components/tools/ui/StepWizard'
import Section0Template from './sections/Section0Template'
import Section2Product from './sections/Section2Product'
import Section3Lote from './sections/Section3Lote'
import Section4Conceptos from './sections/Section4Conceptos'
import Section5Lote from './sections/Section5Lote'

/**
 * EL WIZARD DEL FLUJO DE PLANTILLA — el segundo flujo de la tool.
 *
 * ⚠️ ES UN COMPONENTE APARTE Y NO UNA RAMA DENTRO DE `AdWizard`, a propósito. Los dos flujos
 * comparten la sesión, la tabla y el store, pero tienen pasos distintos: meter condicionales en
 * el wizard clásico enredaría el camino que hoy funciona para ahorrar un archivo.
 *
 * Lo que SÍ se comparte es el paso 2 (`Section2Product`): el producto se describe igual en los
 * dos flujos, y `analyze-product` corre sin cambios porque elegir plantilla ya dejó escrito el
 * `reference_analysis` que esa ruta exige.
 */
// ⚠️ EL ORDEN ES EL CONTRATO: el índice de cada sección tiene que ser su `STEP`, porque eso es
// lo que las rutas escriben en `sessions.step`. Hay un test que lo fija.
const SECTIONS = [Section0Template, Section2Product, Section3Lote, Section4Conceptos, Section5Lote]

export default function TemplateWizard() {
  const {
    step, sessionId, sessionError, variants,
    startNewSession, hydrateFromSession, setStep, resetSession,
  } = useWizardStore()

  // Una sola vez pase lo que pase con el montaje: el StrictMode de React monta dos veces en
  // desarrollo y este efecto puede crear una sesión.
  const arrancado = useRef(false)
  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
    const saved = localStorage.getItem(SESSION_KEY)
    // Sin id guardado hay que VACIAR el store: zustand es un singleton de módulo y sobrevive la
    // navegación del cliente, así que "Empezar" remontaría el wizard con la sesión anterior.
    if (!saved) { resetSession(); return }
    fetch(`/api/generador-anuncios/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<SessionResponse>) : Promise.reject()))
      .then((s) => {
        // ⚠️ UNA SESIÓN DEL FLUJO CLÁSICO NO SE PUEDE REANUDAR ACÁ. Los dos flujos comparten
        // `localStorage` y numeración de pasos, así que sin este guard una sesión clásica en el
        // paso 3 aterrizaría en "Conceptos" con `variants` en null — y esa sección devuelve
        // null, o sea PANTALLA EN BLANCO. Es el modo de fallo que este repo ya registró con
        // `Section2Character` y `validation`.
        if (!s.template_id) { localStorage.removeItem(SESSION_KEY); resetSession(); return }
        hydrateFromSession(s)
      })
      .catch(() => { localStorage.removeItem(SESSION_KEY); resetSession() })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const listas = (variants ?? []).filter((v) => v.imageUrl).length

  const steps = [
    {
      label: 'Plantilla',
      title: 'Elige el tipo de anuncio',
      hint: 'Cada plantilla es una estructura visual distinta. La misma sirve para todos los anuncios del lote: lo que cambia entre ellos es la idea, no el diseño.',
    },
    {
      label: 'Producto',
      title: '¿Qué estás vendiendo?',
      hint: 'El producto y a quién le hablas. De ahí sale el ángulo de cada anuncio.',
    },
    {
      label: 'Lote',
      title: 'Lo que dice la gente, y cuántos anuncios',
      hint: 'Pega comentarios reales de TikTok. Cada anuncio del lote va a atacar una preocupación distinta de las que aparezcan ahí.',
    },
    {
      label: 'Conceptos',
      title: 'Revisa los conceptos',
      hint: 'Todavía no se gastó ningún crédito. Si no te convencen, vuelve y planifica otra vez — el texto es gratis.',
    },
    {
      label: 'Anuncios',
      title: listas > 0 ? 'Tu lote de anuncios' : 'Generemos el lote',
      hint: listas > 0
        ? 'Descarga los que te sirvan. Si alguno falló, puedes reintentar solo ese.'
        : 'Cada anuncio se genera por separado: si uno falla, los demás siguen.',
    },
  ]

  const current = Math.min(step, PASOS_PLANTILLA - 1)
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
      <div key={sessionId ?? 'new'}>
        <Section />
      </div>
    </StepWizard>
  )
}
