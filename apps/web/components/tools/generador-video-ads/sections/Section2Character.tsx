'use client'

import { useRef, useState } from 'react'
import { useVideoStore } from '@/store/video'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { uploadDirect, measureAsset, isPortrait } from '@/lib/video-ads/upload-client'
import { STEP } from '@/lib/video-ads/steps'
import { btnPrimary, errorBox, warnBox, spinner } from './shared'

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

  const set = (k: keyof typeof inputs, v: string) => patch({ inputs: { ...inputs, [k]: v } })

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

  const field = (label: string, k: keyof typeof inputs, placeholder: string, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={k} className="text-[13px] font-semibold text-[#efe7e0]">{label}</label>
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

      {field('Personaje que aparecerá', 'characterDesc', 'Mujer de 25, cabello negro recogido, piel clara',
        'Edad aproximada, sexo, apariencia general.')}
      {field('Raza / etnia / origen cultural', 'characterEthnicity', 'Latina peruana',
        'Obligatorio y solo tuyo: nunca lo deducimos de una foto ni del video de referencia.')}
      {field('Acento / variante de habla', 'accent', 'Español peruano de Lima',
        'Obligatorio. Sin esto la voz saldría con un acento genérico que no elegiste.')}
      {field('Voz (opcional)', 'voice', 'Femenina joven, ritmo conversacional, energía media')}
      {field('Restricciones (opcional)', 'constraints', 'No mencionar precios')}

      {error && <div className={errorBox}>{error}</div>}
      <button onClick={submit} disabled={isLoading || measuring} className={btnPrimary}>
        {isLoading ? <><span className={spinner} />Guardando...</> : 'Validar datos →'}
      </button>
    </div>
  )
}
