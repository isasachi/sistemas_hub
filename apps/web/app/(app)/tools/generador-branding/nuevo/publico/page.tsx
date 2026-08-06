'use client'

import { useRouter } from 'next/navigation'
import BriefShell, { useBrief } from '@/components/tools/generador-branding/nuevo/BriefShell'
import ChipsCustom from '@/components/tools/generador-branding/nuevo/ChipsCustom'
import { AUDIENCE_TAGS, AUDIENCE_MAX, STEPS } from '@/lib/branding/brief'

export default function PublicoPage() {
  const router = useRouter()
  const { brief, update } = useBrief()

  const audience = brief?.audience ?? []

  function next() {
    if (!audience.length) return
    router.push(STEPS[3].path)
  }

  if (!brief) return null

  return (
    <BriefShell
      step={3}
      title="¿Para quién es?"
      hint={`Elige hasta ${AUDIENCE_MAX} o descríbelo tú. Define el tono, no el diseño.`}
      onNext={next}
      nextDisabled={!audience.length}
    >
      <ChipsCustom
        options={AUDIENCE_TAGS}
        selected={audience}
        max={AUDIENCE_MAX}
        placeholder="U otro: descríbelo tú (ej: corredores de trail mayores de 40)"
        onChange={(next) => update({ audience: next })}
      />
    </BriefShell>
  )
}
