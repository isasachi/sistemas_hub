'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import BriefShell, { useBrief, btnPrimary, chipBase, chipOn, chipOff } from '@/components/tools/generador-branding/nuevo/BriefShell'
import {
  DEFAULT_STYLE, DISPLAY_GROUPS, BODY_GROUPS, CONTAINERS, fontsHref, type Style,
} from '@/lib/branding/brief'
import { contrastRatio } from '@/lib/branding/contrast'

/**
 * Paso 5 — el editor de estilo, en vivo.
 * ---------------------------------------------------------------------------
 * Reemplaza a la grilla de 7 presets. La paleta y las tipografías llegan
 * SUGERIDAS para esta marca (una llamada de texto barata a /estilo-sugerido) y
 * desde ahí el usuario las mueve. El preview es HTML/CSS: cuesta $0 y reacciona
 * al instante — las imágenes se generan recién con "Crear mi marca".
 */

const ROLES: { key: keyof Style['palette']; label: string }[] = [
  { key: 'primary', label: 'Primario' },
  { key: 'secondary', label: 'Secundario' },
  { key: 'accent', label: 'Acento' },
  { key: 'dark', label: 'Oscuro' },
  { key: 'light', label: 'Claro' },
]

/** Siluetas del envase, en CSS. `aspect` es ancho/alto. */
const SHAPES: Record<string, { aspect: number; radius: string }> = {
  'Frasco con gotero': { aspect: 0.42, radius: '6px 6px 4px 4px' },
  'Pote': { aspect: 1.15, radius: '10px' },
  'Doypack': { aspect: 0.72, radius: '18px 18px 4px 4px' },
  'Lata': { aspect: 0.55, radius: '8px / 14px' },
  'Tubo': { aspect: 0.34, radius: '3px 3px 14px 14px' },
  'Botella': { aspect: 0.38, radius: '14px 14px 5px 5px' },
  'Caja': { aspect: 0.68, radius: '3px' },
  'Sobre / sachet': { aspect: 0.8, radius: '2px' },
}
/** Un envase escrito a mano igual dibuja algo: sin esto el preview quedaría vacío. */
const DEFAULT_SHAPE = { aspect: 0.62, radius: '10px' }

const field = 'h-11 rounded-xl bg-white/[0.04] border-white/[0.08] text-[13px] text-[#f5f5f5]'
const sectionLabel = 'readout text-[11px] font-bold tracking-[1.5px] uppercase text-[#8a8a8a]'

function FontSelect({ value, groups, onChange }: {
  value: string
  groups: readonly { label: string; fonts: readonly string[] }[]
  onChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? value)}>
      <SelectTrigger className={field}><SelectValue /></SelectTrigger>
      <SelectContent className="bg-[#0f0f0f] border-white/[0.06] text-[#f5f5f5] max-h-[340px]">
        {groups.map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel className="text-[#8a8a8a]">{g.label}</SelectLabel>
            {g.fonts.map((f) => (
              <SelectItem key={f} value={f}
                          className="focus:bg-white/[0.07] focus:text-[#f5f5f5] cursor-pointer"
                          style={{ fontFamily: `'${f}', sans-serif` }}>
                {f}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function EstiloPage() {
  const router = useRouter()
  const { brief, update } = useBrief()
  const [loading, setLoading] = useState(false)
  const asked = useRef<string | null>(null)

  // Lo guardado manda; mientras no haya nada, se PINTA el default sin escribirlo.
  // Escribirlo al montar completaría el brief y la pantalla de entrada dejaría de
  // ofrecer "retomar" con solo asomarse acá.
  const style = brief?.style ?? DEFAULT_STYLE
  const feel = brief?.feel ?? []
  const container = brief?.containerType

  /** Una sola llamada por actitud: volver al editor no vuelve a pedirla. */
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

  // Las 34 familias del catálogo, en una sola hoja y solo en esta pantalla (meterlas
  // en globals.css las volvería render-blocking para toda la app).
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontsHref()
    document.head.appendChild(link)
    return () => { link.remove() }
  }, [])

  const setPalette = (key: keyof Style['palette'], hex: string) =>
    update({ style: { ...style, palette: { ...style.palette, [key]: hex } } })
  const setFont = (key: keyof Style['typography'], font: string) =>
    update({ style: { ...style, typography: { ...style.typography, [key]: font } } })

  function crear() {
    update({ style })
    router.push('/tools/generador-branding/nuevo/generando')
  }

  if (!brief) return null

  const shape = (container && SHAPES[container]) || DEFAULT_SHAPE
  // El texto sobre el envase usa el extremo que más contraste da con el primario.
  const onPrimary = contrastRatio(style.palette.primary, style.palette.dark)
    >= contrastRatio(style.palette.primary, style.palette.light)
    ? style.palette.dark : style.palette.light
  const lowContrast = contrastRatio(style.palette.dark, style.palette.light) < 4.5

  return (
    <BriefShell step={5} title="Tu estilo" hint="Te propusimos un punto de partida para esta marca. Cámbialo hasta que te guste." hideNext full>
      <div className="flex flex-1 min-h-0 border-t border-white/[0.06]">
        {/* ── Configuración ─────────────────────────────────────────── */}
        <div className="flex-1 px-6 md:px-10 py-8 border-r border-white/[0.06] overflow-y-auto">
          <div className="max-w-[560px] flex flex-col gap-8">

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className={sectionLabel}>Tipografías</p>
                <button type="button" onClick={() => suggest(true)} disabled={loading}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#ff9c4d] bg-transparent border-0 cursor-pointer disabled:opacity-40">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Volver a sugerir
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-[#bdbdbd]">Títulos</span>
                  <FontSelect value={style.typography.display} groups={DISPLAY_GROUPS} onChange={(v) => setFont('display', v)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-[#bdbdbd]">Texto</span>
                  <FontSelect value={style.typography.body} groups={BODY_GROUPS} onChange={(v) => setFont('body', v)} />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <p className={sectionLabel}>Paleta</p>
              <div className="flex flex-col gap-2">
                {ROLES.map((r) => (
                  <div key={r.key} className="flex items-center gap-3">
                    {/* ponytail: color picker nativo. Un picker propio son cientos de
                        líneas para lo mismo que el del sistema operativo ya hace. */}
                    <input type="color" value={style.palette[r.key]} aria-label={r.label}
                           onChange={(e) => setPalette(r.key, e.target.value)}
                           className="w-11 h-11 rounded-xl bg-transparent border border-white/[0.1] cursor-pointer p-1" />
                    <span className="text-[13px] text-[#f5f5f5] w-[92px]">{r.label}</span>
                    <Input value={style.palette[r.key]}
                           onChange={(e) => setPalette(r.key, e.target.value)}
                           className={`${field} readout uppercase max-w-[130px]`} />
                  </div>
                ))}
              </div>
              {lowContrast && (
                <p className="text-[12px] text-amber-400">
                  Oscuro y Claro casi no contrastan: el texto de la etiqueta va a costar leerlo.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <p className={sectionLabel}>Envase</p>
                <p className="text-[12px] text-[#8a8a8a]">Opcional. Si no eliges, usamos el que mejor le calce a tu producto.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => update({ containerType: undefined })}
                        className={`${chipBase} ${!container ? chipOn : chipOff}`}>
                  El que mejor calce
                </button>
                {CONTAINERS.map((c) => (
                  <button key={c} type="button" onClick={() => update({ containerType: c })}
                          className={`${chipBase} ${container === c ? chipOn : chipOff}`}>
                    {c}
                  </button>
                ))}
              </div>
              <Input
                placeholder="U otro: descríbelo (ej: frasco de vidrio ámbar con tapa de madera)"
                value={container && !CONTAINERS.includes(container) ? container : ''}
                onChange={(e) => update({ containerType: e.target.value || undefined })}
                className={field}
              />
            </div>
          </div>
        </div>

        {/* ── Preview en vivo ───────────────────────────────────────── */}
        <div className="w-[300px] lg:w-[380px] flex-shrink-0 sticky top-0 self-start max-h-screen overflow-y-auto px-6 py-8 flex flex-col gap-5">
          <p className={sectionLabel}>Cómo se ve</p>

          <div className="rounded-2xl p-6 flex flex-col gap-4 border border-white/[0.08]"
               style={{ background: style.palette.light }}>
            <div className="flex flex-col gap-1">
              <p className="text-[26px] leading-tight break-words"
                 style={{ fontFamily: `'${style.typography.display}', Georgia, serif`, color: style.palette.dark }}>
                {brief.brandName}
              </p>
              <p className="text-[12px] leading-snug"
                 style={{ fontFamily: `'${style.typography.body}', sans-serif`, color: style.palette.dark, opacity: 0.7 }}>
                {brief.productDescription}
              </p>
            </div>

            {/* Silueta del envase con la paleta aplicada */}
            <div className="flex justify-center py-2">
              <div className="relative flex items-center justify-center w-full max-w-[150px]"
                   style={{ aspectRatio: String(shape.aspect), background: style.palette.primary,
                            borderRadius: shape.radius, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[46%] flex items-center justify-center px-2"
                     style={{ background: style.palette.secondary }}>
                  <span className="text-[11px] text-center leading-tight break-words"
                        style={{ fontFamily: `'${style.typography.display}', Georgia, serif`, color: onPrimary }}>
                    {brief.brandName}
                  </span>
                </div>
                <span className="absolute left-0 right-0 bottom-[14%] h-[3px]" style={{ background: style.palette.accent }} />
              </div>
            </div>

            <div className="flex gap-1.5">
              {ROLES.map((r) => (
                <span key={r.key} className="flex-1 h-7 rounded-md border border-black/10"
                      style={{ background: style.palette[r.key] }} title={`${r.label} ${style.palette[r.key]}`} />
              ))}
            </div>
          </div>

          {feel.length > 0 && (
            <p className="text-[12px] text-[#8a8a8a]">
              Actitud: <span className="text-[#bdbdbd]">{feel.join(' · ')}</span>
            </p>
          )}

          <button type="button" onClick={crear} className={btnPrimary + ' h-12 w-full'}>
            Crear mi marca
          </button>
        </div>
      </div>
    </BriefShell>
  )
}
