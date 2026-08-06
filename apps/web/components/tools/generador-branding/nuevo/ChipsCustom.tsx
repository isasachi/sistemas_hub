'use client'

import { Input } from '@/components/ui/input'
import { chipBase, chipOn, chipOff } from './BriefShell'

/**
 * Chips de selección múltiple + una entrada libre, guardadas en el MISMO array.
 * Lo usan el paso 3 (público) y el paso 4 (vibra).
 *
 * El valor libre es simplemente el elemento del array que no está en `options`:
 * así no hace falta un campo aparte en el brief ni una columna nueva en la DB.
 * `max` topea solo los chips — la entrada libre siempre cabe.
 */
export default function ChipsCustom({
  options,
  selected,
  max,
  placeholder,
  onChange,
}: {
  options: readonly string[]
  selected: string[]
  max: number
  placeholder: string
  onChange: (next: string[]) => void
}) {
  const chips = selected.filter((s) => options.includes(s))
  const custom = selected.find((s) => !options.includes(s)) ?? ''

  const commit = (nextChips: string[], nextCustom: string) =>
    onChange(nextCustom.trim() ? [...nextChips, nextCustom.trim()] : nextChips)

  /**
   * ponytail: al llegar al tope, un chip nuevo desplaza al más viejo (FIFO) en vez
   * de quedar deshabilitado. Un chip que no hace nada al click se lee como bug —
   * que es justo lo que se estaba arreglando en el paso 1.
   */
  function toggle(tag: string) {
    const next = chips.includes(tag)
      ? chips.filter((t) => t !== tag)
      : [...chips, tag].slice(-max)
    commit(next, custom)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((tag) => (
          <button key={tag} type="button" onClick={() => toggle(tag)}
                  className={`${chipBase} ${chips.includes(tag) ? chipOn : chipOff}`}>
            {tag}
          </button>
        ))}
      </div>

      <Input
        placeholder={placeholder}
        value={custom}
        // Las comas se van al vuelo: el array viaja a la DB como join(', ') y
        // vuelve con split(', ') — una coma en el texto libre partiría el valor.
        onChange={(e) => commit(chips, e.target.value.replace(/,/g, ''))}
        className="h-11 rounded-xl bg-white/[0.04] border-white/[0.08] text-[13px] text-[#f5f5f5]"
      />

      <p className="text-[12px] text-[#8a8a8a]">
        {chips.length} de {max} elegidos{custom.trim() ? ' · y el tuyo' : ''}
      </p>
    </>
  )
}
