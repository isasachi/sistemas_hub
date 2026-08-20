'use client'

import { useRef, useState } from 'react'
import { useVideoStore } from '@/store/video'
import type { CampoTextoDeInputs, UserInputs } from '@/lib/video-ads/types'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { uploadDirect, measureAsset, isPortrait } from '@/lib/video-ads/upload-client'
import { STEP } from '@/lib/video-ads/steps'
import { btnPrimary, btnGhost, errorBox, warnBox, spinner } from './shared'
import { MAX_PERSONAJES, nuevoId } from '@/lib/video-ads/personajes'

/** Lo que el usuario define de cada personaje. Lo generado lo pone FASE 4. */
type PersonajeInput = NonNullable<UserInputs['personajes']>[number]

const vacio = (i: number): PersonajeInput => ({
  id: nuevoId(i), rol: '', desc: '', etnia: '', acento: '', voz: '', fotoUrl: null,
})

// Paso 2: personaje y voz. Etnia y acento son campos LIBRES y obligatorios: el spec
// prohíbe inferirlos de la apariencia, así que no hay chips ni defaults — si el
// usuario no los escribe, la FASE 0 los marca PENDIENTE y el flujo se detiene.
export default function Section2Character() {
  const { sessionId, inputs, characterUrl, patch, setLoading, isLoading } = useVideoStore()
  const [preview, setPreview] = useState<string | null>(characterUrl)
  const [error, setError] = useState<string | null>(null)
  const [notVertical, setNotVertical] = useState<string | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const pickToken = useRef(0)

  const set = (k: CampoTextoDeInputs, v: string) => patch({ inputs: { ...inputs, [k]: v } })

  // La lista arranca con UN personaje armado desde los campos singulares, así que una
  // sesión a medio llenar (o reanudada) no pierde lo que el usuario ya escribió.
  const gente: PersonajeInput[] = inputs.personajes?.length
    ? inputs.personajes
    : [{ id: nuevoId(0), rol: '', desc: inputs.characterDesc, etnia: inputs.characterEthnicity,
         acento: inputs.accent, voz: inputs.voice, fotoUrl: characterUrl }]

  /**
   * Escribe la lista y, de paso, sincroniza los campos singulares con el PROTAGONISTA.
   * El camino legado —la FASE 0 de un solo personaje y el render de las sesiones viejas—
   * los sigue leyendo, así que desincronizarlos dejaría la validación mirando datos
   * viejos.
   */
  const setGente = (lista: PersonajeInput[]) => patch({
    inputs: {
      ...inputs, personajes: lista,
      characterDesc: lista[0]?.desc ?? '', characterEthnicity: lista[0]?.etnia ?? '',
      accent: lista[0]?.acento ?? '', voice: lista[0]?.voz ?? '',
    },
  })
  const setCampo = (i: number, k: keyof PersonajeInput, v: string) =>
    setGente(gente.map((p, j) => (j === i ? { ...p, [k]: v } : p)))

  async function pickCharacter(f: File) {
    setError(null); setNotVertical(null); setMeasuring(true)
    setPreview(URL.createObjectURL(f))
    const token = ++pickToken.current
    const dims = await measureAsset(f)
    if (token !== pickToken.current) return
    if (!isPortrait(dims)) {
      setNotVertical(`Esa foto es horizontal (${dims!.w}×${dims!.h}). Usa una foto vertical.`)
      setMeasuring(false)
      return
    }
    setMeasuring(false)
    if (!sessionId) return
    setLoading(true)
    try {
      const url = await uploadDirect(sessionId, 'character', f)
      // `uploadDirect` solo sube al bucket, no toca la sesión: el propio `submit`
      // manda `characterUrl` junto con el resto de `inputs` a la ruta `/inputs`,
      // que recién ahí lo persiste en `video_sessions.character_url`. Sin este
      // segundo patch a `inputs`, la matriz de validación nunca confirmaba
      // "Personaje" por imagen aunque la foto ya estuviera en el bucket.
      //
      // OJO: se lee `useVideoStore.getState().inputs` (fresco), NO el `inputs` del
      // closure de este render. `uploadDirect` cruza dos viajes de red (firmar +
      // PUT); nada deshabilita los campos de texto durante esa ventana, así que si
      // el usuario tipea en Personaje/Etnia/Acento/Voz/Restricciones mientras la
      // foto sube, el `inputs` capturado en el closure queda desactualizado. Si se
      // usa ese closure acá, este patch lo pisa y borra en silencio lo que el
      // usuario acaba de escribir. No "simplificar" esto de vuelta a `...inputs`.
      patch({ characterUrl: url, inputs: { ...useVideoStore.getState().inputs, characterUrl: url } })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    if (!sessionId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/inputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      })
      const data = (await res.json()) as { validation?: unknown; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron guardar los datos')
      patch({ validation: data.validation as never, step: STEP.VALIDATION })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const field = (label: string, k: CampoTextoDeInputs, placeholder: string, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={k} className="text-[13px] font-semibold text-[#ededed]">{label}</label>
      {hint && <span className="text-[11.5px] leading-relaxed text-[#8b8b8b]">{hint}</span>}
      <input id={k} value={inputs[k]} onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder} className="jr-field h-11 rounded-lg px-3 text-[13px]" />
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <FileUpload label="Foto del personaje (opcional)" accept="image/*" preview={preview} onFile={pickCharacter} />
      {/* Decía "si no la subes, hoy no se genera ninguna foto" y es falso: la ruta
          `character` genera el retrato con gpt-image-2 a partir de la descripción
          cuando `character_url` viene vacío. */}
      <p className="text-[12px] leading-relaxed text-[#8b8b8b]">
        Si la subes, es la fuente de verdad de la cara: edad, piel, cabello, facciones y
        complexión salen de ahí. Debe ser vertical. Si no la subes, generamos el retrato
        a partir de la descripción que escribas abajo.
      </p>
      {notVertical && <div className={warnBox}>{notVertical}</div>}

      {/* ⚠️ Etnia y acento son campos LIBRES y obligatorios POR PERSONAJE: el spec
          prohíbe inferirlos, y que uno los tenga no cubre al otro — un anuncio con el
          padre sin acento saldría con una voz genérica que nadie eligió. */}
      {gente.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-white/[0.08] p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#ededed]">
              {i === 0 ? 'Protagonista' : `Personaje ${i + 1}`}
            </span>
            {gente.length > 1 && (
              <button
                onClick={() => setGente(gente.filter((_, j) => j !== i).map((x, j) => ({ ...x, id: nuevoId(j) })))}
                className="text-[11.5px] text-[#8b8b8b] hover:text-[#ededed]"
              >
                Quitar
              </button>
            )}
          </div>

          {gente.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-[#ededed]">Rol en el anuncio</label>
              <span className="text-[11.5px] text-[#8b8b8b]">Cómo lo nombra el guión: hijo, padre, vendedora.</span>
              <input value={p.rol} onChange={(e) => setCampo(i, 'rol', e.target.value)}
                placeholder="hijo" className="jr-field h-11 rounded-lg px-3 text-[13px]" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-[#ededed]">Personaje que aparecerá</label>
            <span className="text-[11.5px] text-[#8b8b8b]">Edad aproximada, sexo, apariencia general.</span>
            <input value={p.desc} onChange={(e) => setCampo(i, 'desc', e.target.value)}
              placeholder="Mujer de 25, cabello negro recogido, piel clara"
              className="jr-field h-11 rounded-lg px-3 text-[13px]" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-[#ededed]">Raza / etnia / origen cultural</label>
            <span className="text-[11.5px] text-[#8b8b8b]">Obligatorio y solo tuyo: nunca lo deducimos de una foto ni del video de referencia.</span>
            <input value={p.etnia} onChange={(e) => setCampo(i, 'etnia', e.target.value)}
              placeholder="Latina peruana" className="jr-field h-11 rounded-lg px-3 text-[13px]" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-[#ededed]">Acento / variante de habla</label>
            <span className="text-[11.5px] text-[#8b8b8b]">Obligatorio. Sin esto la voz saldría con un acento genérico que no elegiste.</span>
            <input value={p.acento} onChange={(e) => setCampo(i, 'acento', e.target.value)}
              placeholder="Español peruano de Lima" className="jr-field h-11 rounded-lg px-3 text-[13px]" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-[#ededed]">Voz (opcional)</label>
            <input value={p.voz} onChange={(e) => setCampo(i, 'voz', e.target.value)}
              placeholder="Femenina joven, ritmo conversacional, energía media"
              className="jr-field h-11 rounded-lg px-3 text-[13px]" />
          </div>
        </div>
      ))}

      {gente.length < MAX_PERSONAJES && (
        <button onClick={() => setGente([...gente, vacio(gente.length)])} className={btnGhost}>
          + Agregar otro personaje
        </button>
      )}

      {field('Restricciones (opcional)', 'constraints', 'No mencionar precios')}

      {error && <div className={errorBox}>{error}</div>}
      <button onClick={submit} disabled={isLoading || measuring} className={btnPrimary}>
        {isLoading ? <><span className={spinner} />Guardando...</> : 'Validar datos →'}
      </button>
    </div>
  )
}
