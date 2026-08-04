'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import BriefShell, { useBrief, chipBase, chipOn, chipOff } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { CATEGORY_CHIPS, STEPS, descriptionError } from '@/lib/branding/brief'
import type { Category } from '@/lib/branding/presets'

export default function QueVendesPage() {
  const router = useRouter()
  const { brief, update } = useBrief()
  const [category, setCategory] = useState<Category | null>(null)
  const [description, setDescription] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!brief) return
    setCategory(brief.category ?? null)
    setDescription(brief.productDescription ?? '')
  }, [brief])

  // El chip fija la categoría y siembra un ejemplo CONCRETO editable — pero no pisa
  // lo que el usuario ya escribió.
  function pickChip(c: Category, example: string) {
    setCategory(c)
    if (!description.trim() && example) setDescription(example)
  }

  const error = touched ? descriptionError(description) : null
  const ready = !!category && !descriptionError(description)

  function next() {
    if (!ready || !category) return
    update({ category, productDescription: description.trim() })
    router.push(STEPS[1].path)
  }

  return (
    <BriefShell
      step={1}
      title="¿Qué vendes?"
      hint="Elige la categoría y descríbelo en una línea. Mientras más concreto, mejor sale la marca."
      onNext={next}
      nextDisabled={!ready}
    >
      <div className="flex flex-wrap gap-2">
        {CATEGORY_CHIPS.map((c) => (
          <button key={c.category} type="button" onClick={() => pickChip(c.category, c.example)}
                  className={`${chipBase} ${category === c.category ? chipOn : chipOff}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Input
          id="productDescription"
          placeholder="Ej: Cápsulas de magnesio para dormir mejor"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => setTouched(true)}
          className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-[14px] text-[#f5f5f5]"
        />
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>
    </BriefShell>
  )
}
