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
    resetSession,
  } = useLandingStore()

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
    fetch(`/api/generador-landing/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<LandingSessionResponse>) : Promise.reject()))
      .then((s) => hydrateFromSession(s))
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
