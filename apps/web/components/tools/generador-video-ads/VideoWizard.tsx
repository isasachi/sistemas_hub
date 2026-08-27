'use client'

import { useEffect, useRef } from 'react'
import { useVideoStore, SESSION_KEY } from '@/store/video'
import type { VideoSessionResponse } from '@/lib/video-ads/types'
import { capMaxReached } from '@/lib/video-ads/validation'
import { fetchRegens } from '@/lib/gen-quota-client'
import { STEP } from '@/lib/video-ads/steps'
import { SessionErrorRetry } from '@/components/tools/ui/SessionErrorRetry'
import StepWizard from '@/components/tools/ui/StepWizard'
import Section0Reference from './sections/Section0Reference'
import Section1Product from './sections/Section1Product'
import Section2Character from './sections/Section2Character'
import Section3Validation from './sections/Section3Validation'
import Section4Template from './sections/Section4Template'
import Section5Script from './sections/Section5Script'
import Section6Lotes from './sections/Section6Lotes'
import { LOTE_MAX_SEC } from '@/lib/video-ads/lotes'

// Array posicional: el orden es el orden real del riel. Cada posición corresponde
// al índice del mismo nombre en `STEP` (lib/video-ads/steps.ts) — esa es la fuente
// de verdad de a qué paso corresponde cada número, no este array.
const SECTIONS = [
  Section0Reference, Section1Product, Section2Character,
  Section3Validation, Section4Template, Section5Script, Section6Lotes,
]

// Índice de "Validación" en `SECTIONS`/`steps`: el riel no debe dejar saltar más
// allá de acá mientras la FASE 0 tenga una crítica PENDIENTE.
const VALIDATION_STEP = STEP.VALIDATION

export default function VideoWizard() {
  const {
    step, sessionId, sessionError, validation,
    startNewSession, hydrateFromSession, setStep, setRegens,
    resetSession,
  } = useVideoStore()

  // ⚠️ UNA SOLA VEZ, PASE LO QUE PASE CON EL MONTAJE. Este efecto CREA una sesión en el
  // servidor, y el StrictMode de React monta dos veces en desarrollo: sin este candado se
  // crean DOS filas por visita. Medido en la base, las sesiones fantasma aparecían en
  // pareja con la real y con el mismo minuto de creación.
  const arrancado = useRef(false)

  // ⚠️ EL MONTAJE YA NO CREA LA FILA. Abrir la tool y no hacer nada dejaba una sesión
  // fantasma en el dashboard —22 de 57 filas de `video_sessions` sin su primer insumo,
  // medido—; el listado las filtra al LEER, pero eso ocultaba el síntoma en vez de
  // arreglarlo. Ahora la fila nace en el primer insumo real (`ensureSession`, store), que
  // es lo único que necesitaba el id para firmar la subida.
  useEffect(() => {
    if (arrancado.current) return
    arrancado.current = true
    // ⚠️ `?sesion=<id>` GANA sobre `localStorage`, y existe porque hasta ahora una sesión
    // solo se podía reanudar en el NAVEGADOR QUE LA CREÓ: el id vive en `localStorage`, así
    // que abrirla en otra máquina —o pasarle el link a alguien— era imposible sin entrar por
    // la vista de sesión y pulsar "Reanudar". La ruta ya filtra por dueño (`getVideoSession`
    // con `readUserId`), así que esto NO abre ninguna sesión ajena: un id de otro usuario
    // responde 404 y se cae al camino de siempre.
    const desdeUrl = new URLSearchParams(window.location.search).get('sesion')
    const saved = desdeUrl || localStorage.getItem(SESSION_KEY)
    // ⚠️ SIN ID GUARDADO HAY QUE VACIAR EL STORE, no basta con no hacer nada: zustand es un
    // singleton de MÓDULO y sobrevive la navegación del cliente, así que "Empezar" (que
    // borra el id de `localStorage` y navega acá) remontaba el wizard con la sesión
    // anterior todavía en memoria — y el usuario aterrizaba en su último paso.
    if (!saved) { resetSession(); return }
    if (desdeUrl) {
      localStorage.setItem(SESSION_KEY, desdeUrl)
      // ⚠️ Y SE QUITA DE LA BARRA: si el parámetro se queda, "Reiniciar" seguido de recargar
      // resucita la sesión vieja — el id ya vive en `localStorage`, así que la URL solo
      // puede contradecirlo.
      window.history.replaceState(null, '', window.location.pathname)
    }
    fetch(`/api/generador-video-ads/sessions/${saved}`)
      .then((r) => (r.ok ? (r.json() as Promise<VideoSessionResponse>) : Promise.reject()))
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
      hint: 'La foto del producto es la fuente de verdad visual para el guión. El ángulo reemplaza al del original, conservando su estructura.',
    },
    {
      label: 'Personaje',
      title: '¿Quién habla a cámara?',
      hint: 'La etnia la defines tú: no la deducimos de una foto ni del video de referencia. La voz sale de un perfil fijo en español.',
    },
    {
      label: 'Validación',
      title: 'Antes de seguir, confirmemos los datos',
      hint: 'Revisemos juntos que esté todo. Si falta algo importante, mejor lo completas ahora que descubrirlo en el video terminado.',
    },
    {
      label: 'Plantilla',
      title: 'El ADN del original',
      hint: 'El guión literal, los cortes reales y la plantilla con espacios que se completará con tu producto.',
    },
    {
      label: 'Guión',
      title: 'Tu guión, con la estructura del original',
      hint: 'Completamos los huecos con tu producto, tu ángulo y tu público. La estructura del original no se toca: solo cambia lo que va dentro.',
    },
    {
      label: 'Lotes',
      title: 'Tus clips',
      hint: `El video se renderiza en tramos de máximo ${LOTE_MAX_SEC} segundos. Descárgalos y únelos en tu editor.`,
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
