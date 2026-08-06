'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import BriefShell, { useBrief, chipBase, chipOn, chipOff } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { CATEGORY_CHIPS, STEPS, descriptionError } from '@/lib/branding/brief'
import type { Category } from '@/lib/branding/presets'

export default function QueVendesPage() {
  const router = useRouter()
  const { brief, update } = useBrief()
  const [touched, setTouched] = useState(false)

  // Write-through: el estado vive en el brief, no en un espejo local. Un espejo
  // obliga a re-sincronizar con un effect, y ese effect es el que hacía que los
  // chips dejaran de responder al volver al paso.
  const category = brief?.category ?? null
  const description = brief?.productDescription ?? ''

  /**
   * El chip fija la categoría y siembra un ejemplo concreto y editable. Pisa la
   * descripción si está vacía o si es el ejemplo que sembró otro chip; nunca
   * destruye algo que haya tecleado el usuario. "Otro" (ejemplo vacío) limpia el
   * ejemplo ajeno en vez de dejarlo mintiendo.
   */
  function pickChip(c: Category, example: string) {
    const pisable = !description.trim() || CATEGORY_CHIPS.some((x) => x.example === description)
    update({ category: c, ...(pisable ? { productDescription: example } : {}) })
  }

  const error = touched ? descriptionError(description) : null
  const ready = !!category && !descriptionError(description)

  function next() {
    if (!ready || !category) return
    update({ productDescription: description.trim() })
    router.push(STEPS[1].path)
  }

  // Sin el brief hidratado no se pinta: un input controlado por `brief` renderizaría
  // vacío el primer frame y se comería lo que se teclee en ese instante.
  if (!brief) return null

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
          onChange={(e) => update({ productDescription: e.target.value })}
          onBlur={() => { setTouched(true); update({ productDescription: description.trim() }) }}
          className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-[14px] text-[#f5f5f5]"
        />
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>
    </BriefShell>
  )
}
