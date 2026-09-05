'use client'

import { useRef, useState } from 'react'
import { useVideoStore } from '@/store/video'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { uploadDirect, measureAsset, isPortrait } from '@/lib/video-ads/upload-client'
import { STEP } from '@/lib/video-ads/steps'
import { btnPrimary, errorBox, warnBox, spinner } from './shared'

// Paso 2: el personaje. UNA sola entrada, la foto, y es OBLIGATORIA: el personaje se
// toma siempre de ella y nunca se infiere, así que no hay campo de descripción, ni de
// etnia (se lee de la foto sin declararla), ni de acento (lo infiere la FASE 4 del
// propio personaje), ni de voz (son cuatro perfiles fijos, VOZ_ESTANDAR).
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
      // OJO: se lee `useVideoStore.getState().inputs` (fresco), NO el `inputs` del
      // closure de este render. `uploadDirect` cruza dos viajes de red (firmar + PUT) y
      // nada bloquea los campos durante esa ventana, así que el closure puede quedar
      // desactualizado y este patch pisaría lo que el usuario acaba de escribir.
      patch({ characterUrl: url, inputs: { ...useVideoStore.getState().inputs, characterUrl: url } })

      // FASE 4 EN SEGUNDO PLANO. Generar el avatar tarda ~40-55 s y el usuario los pasa
      // avanzando por validación, plantilla y guión: arrancarlo acá se los ahorra. Se
      // le manda la URL en el body porque `uploadDirect` solo subió al bucket — la fila
      // recibe `character_url` recién al enviar este paso, y sin la URL la ruta
      // generaría un avatar sin referencia. Sin `await` y con el error solo logueado:
      // si falla, el paso del guión lo reintenta y ahí sí se le muestra al usuario.
      void fetch(`/api/generador-video-ads/sessions/${sessionId}/character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterUrl: url }),
      }).catch((e) => console.error('[video-ads] avatar en segundo plano', e))
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

  return (
    <div className="flex flex-col gap-5">
      <FileUpload label="Foto del personaje" accept="image/*" preview={preview} onFile={pickCharacter} />
      <p className="text-[12px] leading-relaxed text-[#8b8b8b]">
        Obligatoria y vertical. De ella salen edad, piel, cabello, facciones y complexión —
        y también el acento y la voz del anuncio. La cara del video será una persona
        nueva construida con ese mismo tipo físico, nunca la de la foto. Empezamos a
        generarla apenas la subas, mientras avanzas por los siguientes pasos.
      </p>
      {notVertical && <div className={warnBox}>{notVertical}</div>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="constraints" className="text-[13px] font-semibold text-[#ededed]">Restricciones (opcional)</label>
        <input id="constraints" value={inputs.constraints} onChange={(e) => set('constraints', e.target.value)}
          placeholder="No mencionar precios" className="jr-field h-11 rounded-lg px-3 text-[13px]" />
      </div>

      {error && <div className={errorBox}>{error}</div>}
      <button onClick={submit} disabled={isLoading || measuring || !characterUrl} className={btnPrimary}>
        {isLoading ? <><span className={spinner} />Guardando...</> : 'Validar datos →'}
      </button>
    </div>
  )
}
