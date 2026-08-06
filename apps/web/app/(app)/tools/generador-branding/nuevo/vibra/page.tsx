'use client'

import { useRouter } from 'next/navigation'
import BriefShell, { useBrief } from '@/components/tools/generador-branding/nuevo/BriefShell'
import ChipsCustom from '@/components/tools/generador-branding/nuevo/ChipsCustom'
import { FEEL_TAGS, FEEL_MAX, STEPS } from '@/lib/branding/brief'

/**
 * Paso 4 — la actitud de la marca.
 *
 * Es la única dirección de arte que recibe el motor de imagen, y también lo que
 * alimenta la sugerencia de paleta y tipografías del paso 5. Reemplaza a los 7
 * estilos cerrados: dos marcas con actitudes distintas ya no pueden salir iguales.
 */
export default function VibraPage() {
  const router = useRouter()
  const { brief, update } = useBrief()

  const feel = brief?.feel ?? []

  function next() {
    if (!feel.length) return
    router.push(STEPS[4].path)
  }

  if (!brief) return null

  return (
    <BriefShell
      step={4}
      title="¿Qué debe transmitir?"
      hint={`Elige hasta ${FEEL_MAX} o descríbelo con tus palabras. De acá sale el carácter de la marca.`}
      onNext={next}
      nextDisabled={!feel.length}
    >
      <ChipsCustom
        options={FEEL_TAGS}
        selected={feel}
        max={FEEL_MAX}
        placeholder="O descríbelo tú (ej: como una botica de barrio de los años 50)"
        onChange={(next) => update({ feel: next })}
      />
    </BriefShell>
  )
}
