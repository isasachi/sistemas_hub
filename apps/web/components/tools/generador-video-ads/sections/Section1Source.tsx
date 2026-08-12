'use client'

import { useRef, useState } from 'react'
import { useVideoStore } from '@/store/video'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { ChipGroup } from '@/components/tools/ui/ChipGroup'
import { uploadDirect, measureAsset, isPortrait, MAX_VIDEO_MB } from '@/lib/video-ads/upload-client'
import type { CharacterBrief, ForensicAnalysis } from '@/lib/video-ads/types'
import { btnPrimary, errorBox, warnBox, spinner } from './shared'

// Chips del brief de personaje. Son sugerencias, no un catálogo cerrado: el campo
// "Detalle libre" deja escribir cualquier cosa que no esté en la lista.
const CHIPS = {
  gender: ['Mujer joven', 'Hombre joven', 'Mujer adulta', 'Hombre adulto'],
  age: ['20s', '30s', '40s', '50+'],
  ethnicity: ['Latina', 'Andina', 'Mestiza', 'Afrodescendiente', 'Asiática'],
  background: ['Sala de casa', 'Dormitorio', 'Baño', 'Cocina', 'Calle', 'Gimnasio'],
  coverage: ['Primer plano', 'Plano medio corto', 'Plano medio'],
  cameraPlacement: ['En mano', 'Trípode', 'Selfie'],
} as const

const DEFAULT_BRIEF: CharacterBrief = {
  gender: 'Mujer joven',
  age: '30s',
  ethnicity: 'Latina',
  background: 'Sala de casa',
  style: 'iphone',
  cameraPlacement: 'En mano',
  coverage: 'Plano medio corto',
  additionalDetails: 'Piel real, sin retoque',
}

export default function Section1Source() {
  const s = useVideoStore()
  const { sessionId, mode, patch, setLoading, isLoading } = s

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(s.characterUrl)
  const [brief, setBrief] = useState<CharacterBrief>(s.characterBrief ?? DEFAULT_BRIEF)
  const [error, setError] = useState<string | null>(null)
  const [notVertical, setNotVertical] = useState<string | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const pickToken = useRef(0)

  // El asset se mide antes de dejar continuar: el video sale 9:16 y una fuente
  // apaisada lo arruina. `measuring` bloquea el botón mientras tanto — sin él hay
  // una ventana en la que el submit está habilitado y la medición aún no llegó.
  async function pick(f: File) {
    if (mode === 'video-ref' && f.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`El video pesa más de ${MAX_VIDEO_MB} MB. Recórtalo o bájale la calidad.`)
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError(null)
    setNotVertical(null)
    setMeasuring(true)
    // Si el usuario cambia de archivo mientras se mide el anterior, el resultado viejo
    // no debe pisar al nuevo: bloquearía un archivo válido sin más salida que re-elegirlo.
    const token = ++pickToken.current
    const dims = await measureAsset(f)
    if (token !== pickToken.current) return
    setNotVertical(
      isPortrait(dims)
        ? null
        : `Ese ${mode === 'video-ref' ? 'video' : 'archivo'} es horizontal (${dims!.w}×${dims!.h}). ` +
          'El anuncio se genera vertical (9:16), así que necesitamos una fuente vertical: ' +
          `${mode === 'video-ref' ? 'recórtalo vertical' : 'usa una foto vertical'} y vuelve a subirlo.`,
    )
    setMeasuring(false)
  }

  // Línea 1: sube el video (firmado) y lo manda a analizar.
  async function submitVideo() {
    if (!sessionId || !file) return
    setLoading(true); setError(null)
    try {
      const videoUrl = await uploadDirect(sessionId, 'reference-video', file)
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/analyze-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      })
      const data = (await res.json()) as { analysis?: ForensicAnalysis; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo analizar el video')
      patch({ referenceVideoUrl: videoUrl, forensicAnalysis: data.analysis!, step: 2 })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Línea 2: sube la foto del personaje (firmado) y la persiste.
  async function submitCharacterPhoto() {
    if (!sessionId || !file) return
    setLoading(true); setError(null)
    try {
      const characterUrl = await uploadDirect(sessionId, 'character', file)
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterUrl }),
      })
      if (!res.ok) throw new Error('No se pudo guardar el personaje')
      patch({ characterUrl, step: 2 })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Línea 3: genera el personaje a partir del brief.
  async function generateCharacter() {
    if (!sessionId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}/character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief }),
      })
      const data = (await res.json()) as { characterUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo generar el personaje')
      patch({ characterBrief: brief, characterUrl: data.characterUrl! })
      setPreview(data.characterUrl!)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'character-gen') {
    const field = (label: string, key: keyof CharacterBrief, options: readonly string[]) => (
      <div key={key} className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-[#ededed]">{label}</span>
        <ChipGroup
          options={[...options]}
          selected={brief[key]}
          onChange={(v) => setBrief({ ...brief, [key]: v as string })}
        />
      </div>
    )
    return (
      <div className="flex flex-col gap-5">
        {field('Quién', 'gender', CHIPS.gender)}
        {field('Edad', 'age', CHIPS.age)}
        {field('Rasgos', 'ethnicity', CHIPS.ethnicity)}
        {field('Dónde', 'background', CHIPS.background)}
        {field('Encuadre', 'coverage', CHIPS.coverage)}
        {field('Cámara', 'cameraPlacement', CHIPS.cameraPlacement)}
        <div className="flex flex-col gap-2">
          <label htmlFor="detalle" className="text-[13px] font-semibold text-[#ededed]">Detalle libre</label>
          <input
            id="detalle"
            value={brief.additionalDetails}
            onChange={(e) => setBrief({ ...brief, additionalDetails: e.target.value })}
            placeholder="Pelo rizado, lentes, ropa deportiva…"
            className="jr-field h-11 rounded-lg px-3 text-[13px]"
          />
        </div>

        {preview && (
          <img src={preview} alt="personaje" className="max-h-72 w-full rounded-2xl border border-white/[0.08] object-contain" />
        )}
        {error && <div className={errorBox}>{error}</div>}

        <button onClick={generateCharacter} disabled={isLoading} className={btnPrimary}>
          {isLoading ? <><span className={spinner} />Generando personaje...</> : preview ? 'Generar otro' : 'Generar personaje →'}
        </button>
        {preview && !isLoading && (
          <button onClick={() => patch({ step: 2 })} className={btnPrimary}>Seguir con este personaje →</button>
        )}
      </div>
    )
  }

  const isVideo = mode === 'video-ref'
  return (
    <div className="flex flex-col gap-4">
      {isVideo && preview ? (
        <video src={preview} controls playsInline className="max-h-72 w-full rounded-2xl border border-white/[0.08] bg-black object-contain" />
      ) : null}
      <FileUpload
        label={isVideo ? `Seleccionar video (máx ${MAX_VIDEO_MB} MB)` : 'Seleccionar foto del personaje'}
        accept={isVideo ? 'video/mp4,video/quicktime,video/webm' : 'image/*'}
        onFile={pick}
        preview={isVideo ? null : preview}
      />
      <p className="text-[12px] leading-relaxed text-[#8b8b8b]">
        {isVideo ? 'El video' : 'La foto'} tiene que ser <strong className="font-semibold text-[#cfcfcf]">vertical</strong> (9:16,
        como lo grabas con el celular en mano). La foto del producto, en el paso siguiente, puede
        venir en cualquier formato.
      </p>
      {notVertical && <div className={warnBox}>{notVertical}</div>}
      {error && <div className={errorBox}>{error}</div>}
      <button
        onClick={isVideo ? submitVideo : submitCharacterPhoto}
        disabled={!file || isLoading || measuring || !!notVertical}
        className={btnPrimary}
      >
        {isLoading
          ? <><span className={spinner} />{isVideo ? 'Analizando video...' : 'Subiendo...'}</>
          : measuring ? <><span className={spinner} />Revisando el formato...</>
          : isVideo ? 'Analizar referencia →' : 'Continuar →'}
      </button>
    </div>
  )
}
