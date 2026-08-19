'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import BriefShell, { useBrief, btnPrimary } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { DEFAULT_STYLE, PALETTE_MAX, feelWords, type Style } from '@/lib/branding/brief'
import { colorFromName } from '@/lib/branding/color-names'

/**
 * Paso 5 — las 2 casillas del prompt que el wizard no pregunta.
 * ---------------------------------------------------------------------------
 * Llegan propuestas por el LLM y se editan. Los colores van por NOMBRE, no por
 * hex: el prompt que produjo los mejores boards decía "bold orange, soft yellow,
 * pure white, electric lime" y el modelo eligió los valores. Las burbujas son una
 * aproximación al nombre escrito para no teclear a ciegas — no son el color
 * final, y por eso no hay selector: elegir un hex acá sería fingir un control
 * que el prompt no tiene.
 */

const field = 'rounded-xl bg-white/[0.04] border-white/[0.08] text-[13px] text-[#efe7e0]'

/**
 * Burbuja de color aproximada al nombre escrito. Es una AYUDA, no la verdad: el
 * prompt manda el nombre y el modelo elige el tono final. Un nombre que no se
 * reconoce deja la burbuja punteada y vacía en vez de inventar un color.
 */
function Bubble({ name, size = 'w-8 h-8' }: { name: string; size?: string }) {
  const hex = colorFromName(name)
  return (
    <span
      className={`${size} shrink-0 rounded-full border transition-colors ${
        hex ? 'border-white/20' : 'border-dashed border-white/20'
      }`}
      style={hex ? { background: hex } : undefined}
      title={hex ? `${name} — aprox. ${hex}` : 'Escribe un color para verlo'}
      aria-hidden
    />
  )
}

const sectionLabel = 'readout text-[11px] font-bold tracking-[1.5px] uppercase text-[#a98c88]'

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
  const setColor = (i: number, v: string) =>
    set({ palette: style.palette.map((c, j) => (j === i ? v : c)) })

  function crear() {
    update({ style })
    router.push('/tools/generador-branding/nuevo/generando')
  }

  if (!brief) return null

  return (
    <BriefShell step={5} title="Tu estilo" hint="Te propusimos una dirección para esta marca. Cámbiala hasta que te guste." hideNext full>
      <div className="flex flex-1 min-h-0 border-t border-white/[0.06]">
        {/* ── Configuración ─────────────────────────────────────────── */}
        <div className="flex-1 px-6 md:px-10 py-8 border-r border-white/[0.06] overflow-y-auto">
          <div className="max-w-[560px] mx-auto flex flex-col gap-8">

            <div className="flex items-center justify-between gap-3">
              <p className={sectionLabel}>Colores</p>
              <button type="button" onClick={() => suggest(true)} disabled={loading}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#e8467a] bg-transparent border-0 cursor-pointer disabled:opacity-40">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Volver a proponer
              </button>
            </div>

            <div className="flex flex-col gap-2 -mt-5">
              <p className="text-[12px] text-[#a98c88]">
                Descríbelos con palabras. El modelo elige los tonos exactos y los rotula en la
                identidad — le salen mejor que imponiéndoselos.
              </p>
              {style.palette.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Bubble name={c} />
                  <Input value={c} onChange={(e) => setColor(i, e.target.value)}
                         placeholder="Ej: naranja intenso" className={`${field} h-11`} />
                  <button type="button" aria-label="Quitar color"
                          onClick={() => set({ palette: style.palette.filter((_, j) => j !== i) })}
                          className="w-9 h-9 shrink-0 rounded-lg border border-white/[0.1] text-[#a98c88] hover:text-[#efe7e0] bg-transparent cursor-pointer flex items-center justify-center">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {style.palette.length < PALETTE_MAX && (
                <button type="button" onClick={() => set({ palette: [...style.palette, ''] })}
                        className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#c9b4ae] hover:text-[#efe7e0] bg-transparent border-0 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Agregar color
                </button>
              )}
            </div>

            <label className="flex flex-col gap-2">
              <span className={sectionLabel}>Inspiración</span>
              <span className="text-[12px] text-[#a98c88] -mt-1">
                De dónde sale el mundo visual, en una frase corta: un estilo de foto, una época, un material.
              </span>
              <Input value={style.inspiration} onChange={(e) => set({ inspiration: e.target.value })}
                     placeholder="Ej: Fotografía editorial de producto" className={`${field} h-11`} />
            </label>
          </div>
        </div>

        {/* ── Ficha del prompt ──────────────────────────────────────── */}
        <div className="w-[300px] lg:w-[400px] flex-shrink-0 sticky top-0 self-start max-h-screen overflow-y-auto px-6 py-8 flex flex-col gap-5">
          <p className={sectionLabel}>Lo que le vamos a pedir</p>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex flex-col gap-3">
            {([
              ['Marca', brief.brandName],
              ['Eslogan', brief.tagline ?? ''],
              ['Producto', brief.productDescription],
              ['Público', (brief.audience ?? []).join(', ')],
              ['Actitud', feelWords(feel)],
              ['Inspiración', style.inspiration],
            ] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <span className="readout text-[10px] uppercase tracking-[1.2px] text-[#a98c88]">{k}</span>
                <span className="text-[12px] text-[#efe7e0] leading-snug">{v}</span>
              </div>
            ))}

            {style.palette.filter(Boolean).length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="readout text-[10px] uppercase tracking-[1.2px] text-[#a98c88]">Colores</span>
                {style.palette.filter(Boolean).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Bubble name={c} size="w-4 h-4" />
                    <span className="text-[12px] text-[#efe7e0] leading-snug">{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-[#a98c88] leading-snug">
            Recibirás la identidad completa más el logo (en tres versiones), la etiqueta 360
            lista para imprenta y el mockup del producto.
          </p>

          <button type="button" onClick={crear} className={btnPrimary + ' h-12 w-full'}>
            Crear mi marca
          </button>
        </div>
      </div>
    </BriefShell>
  )
}
