'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BriefShell, { useBrief, chipBase, chipOn, chipOff } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { AUDIENCE_TAGS, AUDIENCE_MAX, STEPS } from '@/lib/branding/brief'

export default function PublicoPage() {
  const router = useRouter()
  const { brief, update } = useBrief()
  const [audience, setAudience] = useState<string[]>([])

  useEffect(() => { if (brief) setAudience(brief.audience ?? []) }, [brief])

  function toggle(tag: string) {
    setAudience((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length >= AUDIENCE_MAX ? prev : [...prev, tag],
    )
  }

  function next() {
    if (!audience.length) return
    update({ audience })
    router.push(STEPS[3].path)
  }

  return (
    <BriefShell
      step={3}
      title="¿Para quién es?"
      hint={`Elige hasta ${AUDIENCE_MAX}. Define el tono, no el diseño.`}
      onNext={next}
      nextDisabled={!audience.length}
    >
      <div className="flex flex-wrap gap-2">
        {AUDIENCE_TAGS.map((tag) => {
          const on = audience.includes(tag)
          const full = !on && audience.length >= AUDIENCE_MAX
          return (
            <button key={tag} type="button" onClick={() => toggle(tag)} disabled={full}
                    className={`${chipBase} ${on ? chipOn : chipOff} ${full ? 'opacity-35 cursor-not-allowed' : ''}`}>
              {tag}
            </button>
          )
        })}
      </div>
      <p className="text-[12px] text-[#8a8a8a]">{audience.length} de {AUDIENCE_MAX} elegidos</p>
    </BriefShell>
  )
}
