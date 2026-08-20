'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ToolIntro from '@/components/tools/ui/ToolIntro'
import { useBrief } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, clearBrief, isResumable, resumePath, firstIncompleteStep, loadLastSession } from '@/lib/branding/brief'

// Misma vista inicial que las otras tools (ToolIntro), con los datos de esta: el
// brief a medias vive en localStorage y no en la API de sesiones, y la última
// marca generada se guarda aparte (crear otra limpia el brief, no el historial).
//
// ⚠️ La descripción decía "un brandboard en PDF" y no existe: `buildKit` arma un
// .zip con PNG (identidad, logo ×3, etiqueta-360, mockup) más un marca.txt.
export default function GeneradorBrandingEntrada() {
  const router = useRouter()
  const { brief } = useBrief()
  const [lastSession, setLastSession] = useState<string | null>(null)
  useEffect(() => { setLastSession(loadLastSession()) }, [])

  // Mismo criterio que las demás: solo se ofrece retomar lo que pasó del paso 1.
  // ⚠️ Un brief con solo la primera pregunta respondida ya no avisa, y el CTA lo
  // borra sin preguntar — es una respuesta, no una sesión.
  const saved = brief && isResumable(brief) && firstIncompleteStep(brief) > 0 ? brief : null

  return (
    <ToolIntro
      name="Generador de Branding"
      slug="generador-branding"
      title="Generador de Branding"
      description="Cuéntanos qué vendes y para quién. Generamos la identidad visual de tu marca: colores, tipografías, logo, etiqueta y mockup de producto. Personaliza el resultado y descarga todos los archivos listos para usar."
      cta={lastSession ? 'Crear otra marca' : 'Crear mi marca'}
      onStart={() => { clearBrief(); router.push(STEPS[0].path) }}
      state={{
        last: lastSession
          ? {
              detail: 'Tu última marca generada sigue disponible.',
              onClick: () => router.push(`/tools/generador-branding/nuevo/resultado?s=${lastSession}`),
            }
          : null,
        resume: saved
          ? {
              detail: `${saved.brandName ? `${saved.brandName} · ` : ''}quedaste en la pregunta ${firstIncompleteStep(saved) + 1} de ${STEPS.length}.`,
              onClick: () => router.push(resumePath(saved)),
            }
          : null,
      }}
    />
  )
}
