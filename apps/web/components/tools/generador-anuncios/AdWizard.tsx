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
    resetSession,
  } = useWizardStore()

  // Reanudar: si hay un id guardado y la sesión existe, rehidratar; si no, una nueva.
  // ⚠️ UNA SOLA VEZ, PASE LO QUE PASE CON EL MONTAJE. Este efecto CREA una sesión en el
  // servidor, y el StrictMode de React monta dos veces en desarrollo: sin este candado se
  // crean DOS filas por visita. Medido en la base, las sesiones fantasma aparecían en
  // pareja con la real y con el mismo minuto de creación.
  const arrancado = useRef(false)

  // ponytail: la fila se crea al MONTAR, no en la primera acción real. El listado del
  // dashboard filtra las vacías (ver `list*Sessions`), así que no molestan — pero se
  // siguen creando. El upgrade es crear la sesión con el primer insumo (el upload del
  // paso 1) en vez de acá; hoy no se hace porque el wizard necesita un id para subir a
  // `/upload-url` y cambiarlo toca los tres flujos a la vez.
  // ⚠️ EL MONTAJE YA NO CREA LA FILA. Abrir la tool y no hacer nada dejaba una sesión
  // fantasma; el listado del dashboard las filtra al LEER, lo que ocultaba el síntoma en
  // vez de arreglarlo. Ahora la fila nace en el primer insumo real (`ensureSession`).
  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
    const saved = localStorage.getItem(SESSION_KEY)
    // ⚠️ SIN ID GUARDADO HAY QUE VACIAR EL STORE, no basta con no hacer nada: zustand es un
    // singleton de MÓDULO y sobrevive la navegación del cliente, así que "Empezar" (que
    // borra el id de `localStorage` y navega acá) remontaba el wizard con la sesión
    // anterior todavía en memoria — y el usuario aterrizaba en su último paso.
    if (!saved) { resetSession(); return }
    fetch(`/api/generador-anuncios/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<SessionResponse>) : Promise.reject()))
      // ⚠️ Y AL REVÉS: una sesión del flujo de PLANTILLA no se reanuda acá. Los dos comparten
      // `localStorage` y numeración de pasos, así que una de plantilla en el paso 3 caería en
      // "Copy" con `copy_versions` en null. Ver el guard simétrico en `TemplateWizard`.
      .then((s) => {
        if (s.template_id) { localStorage.removeItem(SESSION_KEY); resetSession(); return }
        hydrateFromSession(s)
      })
      // ⚠️ Un id que ya no existe (sesión borrada del dashboard) o que es de otra cuenta
      // NO crea una fila: vacía el wizard y la sesión nace con el primer insumo, igual que
      // en el camino sin id. Con `startNewSession` acá, un link viejo o ajeno dejaba una
      // sesión fantasma en silencio — el problema que este cambio vino a eliminar.
      // ⚠️ Y SE BORRA EL ID GUARDADO: antes lo pisaba el `startNewSession` de este mismo
      // catch. Sin eso, un id muerto se queda en `localStorage` y vuelve a fallar en cada
      // visita — el wizard queda pidiéndole al servidor una sesión que no existe para siempre.
      .catch(() => { localStorage.removeItem(SESSION_KEY); resetSession() })
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
