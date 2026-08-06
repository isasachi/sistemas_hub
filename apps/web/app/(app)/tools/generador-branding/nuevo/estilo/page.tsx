'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import BriefShell, { useBrief, btnPrimary, chipBase, chipOn, chipOff } from '@/components/tools/generador-branding/nuevo/BriefShell'
import {
  DEFAULT_STYLE, PACKAGING_CHIPS, PALETTE_MAX, PALETTE_MIN, feelWords, type Style, type Swatch,
} from '@/lib/branding/brief'

/**
 * Paso 5 — las 4 casillas del prompt maestro que el usuario no respondió.
 * ---------------------------------------------------------------------------
 * Llegan propuestas por el LLM y se editan en vivo. NO hay selector de
 * tipografía: el prompt maestro no tiene esa casilla y el modelo elige la suya.
 * El preview es la ficha del prompt — HTML/CSS, $0; la imagen se genera recién
 * con "Crear mi marca".
 */

const field = 'rounded-xl bg-white/[0.04] border-white/[0.08] text-[13px] text-[#f5f5f5]'
const sectionLabel = 'readout text-[11px] font-bold tracking-[1.5px] uppercase text-[#8a8a8a]'

export default function EstiloPage() {
  const router = useRouter()
  const { brief, update } = useBrief()
  const [loading, setLoading] = useState(false)
  const asked = useRef<string | null>(null)

  // Lo guardado manda; mientras no haya nada se PINTA el default sin escribirlo.
  // Escribirlo al montar completaría el brief y la pantalla de entrada dejaría de
  // ofrecer "retomar" con solo asomarse acá.
  const style = brief?.style ?? DEFAULT_STYLE
  const feel = brief?.feel ?? []

  async function suggest(force = false) {
    if (!brief) return
    const signature = feel.join('|')
    if (!force && (brief.suggestedFor === signature || asked.current === signature)) return
    asked.current = signature
    setLoading(true)
    try {
      const res = await fetch('/api/generador-branding/estilo-sugerido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: brief.category, productDescription: brief.productDescription,
          brandName: brief.brandName, audience: brief.audience, feel,
        }),
      })
      const data = (await res.json()) as { style?: Style }
      if (data.style) update({ style: data.style, suggestedFor: signature })
    } catch {
      // La ruta ya degrada sola; si ni eso llega, se queda el default editable.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void suggest() }, [brief?.feel?.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Style>) => update({ style: { ...style, ...patch } })
  const setSwatch = (i: number, patch: Partial<Swatch>) =>
    set({ palette: style.palette.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  function togglePiece(piece: string) {
    const list = style.products.split(',').map((s) => s.trim()).filter(Boolean)
    const next = list.includes(piece) ? list.filter((p) => p !== piece) : [...list, piece]
    set({ products: next.join(', ') })
  }

  function crear() {
    update({ style })
    router.push('/tools/generador-branding/nuevo/generando')
  }

  if (!brief) return null
  const pieces = style.products.split(',').map((s) => s.trim()).filter(Boolean)

  return (
    <BriefShell step={5} title="Tu estilo" hint="Te propusimos una dirección para esta marca. Cámbiala hasta que te guste." hideNext full>
      <div className="flex flex-1 min-h-0 border-t border-white/[0.06]">
        {/* ── Configuración ─────────────────────────────────────────── */}
        <div className="flex-1 px-6 md:px-10 py-8 border-r border-white/[0.06] overflow-y-auto">
          <div className="max-w-[640px] mx-auto flex flex-col gap-8">

            <div className="flex items-center justify-between gap-3">
              <p className={sectionLabel}>Paleta</p>
              <button type="button" onClick={() => suggest(true)} disabled={loading}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#ff9c4d] bg-transparent border-0 cursor-pointer disabled:opacity-40">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Volver a proponer
              </button>
            </div>

            <div className="flex flex-col gap-2 -mt-5">
              {style.palette.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  {/* ponytail: color picker nativo. Uno propio son cientos de líneas
                      para lo que el del sistema operativo ya hace. */}
                  <input type="color" value={c.hex} aria-label={`Color ${i + 1}`}
                         onChange={(e) => setSwatch(i, { hex: e.target.value })}
                         className="w-11 h-11 rounded-xl bg-transparent border border-white/[0.1] cursor-pointer p-1 shrink-0" />
                  <Input value={c.name} onChange={(e) => setSwatch(i, { name: e.target.value })}
                         placeholder="Nombre del color" className={`${field} h-11`} />
                  <Input value={c.hex} onChange={(e) => setSwatch(i, { hex: e.target.value })}
                         className={`${field} h-11 readout uppercase max-w-[120px]`} />
                  {style.palette.length > PALETTE_MIN && (
                    <button type="button" aria-label="Quitar color"
                            onClick={() => set({ palette: style.palette.filter((_, j) => j !== i) })}
                            className="w-9 h-9 shrink-0 rounded-lg border border-white/[0.1] text-[#8a8a8a] hover:text-[#f5f5f5] bg-transparent cursor-pointer flex items-center justify-center">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {style.palette.length < PALETTE_MAX && (
                <button type="button" onClick={() => set({ palette: [...style.palette, { name: 'Nuevo', hex: '#888888' }] })}
                        className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#bdbdbd] hover:text-[#f5f5f5] bg-transparent border-0 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Agregar color
                </button>
              )}
            </div>

            <label className="flex flex-col gap-2">
              <span className={sectionLabel}>Inspiración visual</span>
              <span className="text-[12px] text-[#8a8a8a] -mt-1">De dónde sale el mundo visual: una época, un material, un movimiento de diseño.</span>
              <Textarea value={style.inspiration} onChange={(e) => set({ inspiration: e.target.value })}
                        rows={2} className={`${field} py-2.5`} />
            </label>

            <label className="flex flex-col gap-2">
              <span className={sectionLabel}>Estilo gráfico</span>
              <span className="text-[12px] text-[#8a8a8a] -mt-1">Cómo se dibuja: composición, formas, iconografía. Distinto de la actitud, que es cómo se siente.</span>
              <Textarea value={style.graphicStyle} onChange={(e) => set({ graphicStyle: e.target.value })}
                        rows={2} className={`${field} py-2.5`} />
            </label>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <p className={sectionLabel}>Productos y piezas</p>
                <p className="text-[12px] text-[#8a8a8a]">Qué aparece en el board. Puedes elegir varias.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PACKAGING_CHIPS.map((c) => (
                  <button key={c} type="button" onClick={() => togglePiece(c)}
                          className={`${chipBase} ${pieces.includes(c) ? chipOn : chipOff}`}>
                    {c}
                  </button>
                ))}
              </div>
              <Textarea value={style.products} onChange={(e) => set({ products: e.target.value })}
                        rows={2} className={`${field} py-2.5`}
                        placeholder="O descríbelo tú (ej: pote de 300 g con tapa naranja, doypack y shaker)" />
            </div>
          </div>
        </div>

        {/* ── Ficha del prompt ──────────────────────────────────────── */}
        <div className="w-[300px] lg:w-[420px] flex-shrink-0 sticky top-0 self-start max-h-screen overflow-y-auto px-6 py-8 flex flex-col gap-5">
          <p className={sectionLabel}>Lo que le vamos a pedir</p>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-[22px] font-bold text-[#f5f5f5] leading-tight break-words">{brief.brandName}</p>
              {brief.tagline && <p className="readout text-[11px] uppercase tracking-[1.5px] text-[#ff9c4d]">{brief.tagline}</p>}
              <p className="text-[12px] text-[#bdbdbd] leading-snug">{brief.productDescription}</p>
            </div>

            <div className="flex gap-1.5">
              {style.palette.map((c, i) => (
                <span key={i} className="flex-1 h-9 rounded-md border border-white/10"
                      style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              {style.palette.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#bdbdbd] truncate">{c.name}</span>
                  <span className="readout text-[#8a8a8a] uppercase">{c.hex}</span>
                </div>
              ))}
            </div>

            {([
              ['Actitud', feelWords(feel)],
              ['Público', (brief.audience ?? []).join(', ')],
              ['Inspiración', style.inspiration],
              ['Estilo gráfico', style.graphicStyle],
              ['Piezas', style.products],
            ] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <span className="readout text-[10px] uppercase tracking-[1.2px] text-[#8a8a8a]">{k}</span>
                <span className="text-[12px] text-[#bdbdbd] leading-snug">{v}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[#8a8a8a] leading-snug">
            Las tipografías, el logo y los elementos gráficos los decide el modelo:
            es lo que hace que cada marca salga distinta.
          </p>

          <button type="button" onClick={crear} className={btnPrimary + ' h-12 w-full'}>
            Crear mi marca
          </button>
        </div>
      </div>
    </BriefShell>
  )
}
