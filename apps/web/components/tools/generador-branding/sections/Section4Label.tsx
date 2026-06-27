'use client'

import { useRef, useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'
import { FileUpload } from '@/components/tools/ui/FileUpload'
import { FieldGroup } from '@/components/tools/ui/FieldGroup'
import { RegenControls } from '@/components/tools/ui/RegenControls'
import type { LabelData } from '@/lib/branding/types'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

const STATUS_TEXT: Record<string, string> = {
  loading_images: 'Cargando el logo...',
  generating: 'Diseñando la etiqueta...',
  uploading: 'Guardando...',
}

export default function Section4Label() {
  const { sessionId, labelUrl, labelData, setLabel, setLabelReference, regens, setRegen } = useBrandingStore()
  const [packagingFormat, setPackagingFormat] = useState(labelData?.packagingFormat ?? '')
  const [ingredients, setIngredients] = useState(labelData?.ingredients ?? '')
  const [netWeight, setNetWeight] = useState(labelData?.netWeight ?? '')
  const [units, setUnits] = useState(labelData?.units ?? '')
  const [highlight, setHighlight] = useState(labelData?.highlight ?? '')
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refPreview, setRefPreview] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('generating')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const sseKey = useRef(0)
  const bodyRef = useRef<{ labelData: LabelData; prompt?: string }>({ labelData: { packagingFormat: '', ingredients: '', netWeight: '', units: '', highlight: '' } })

  function onRefFile(f: File) {
    setRefFile(f)
    setRefPreview(URL.createObjectURL(f))
  }

  function handleEvent(e: { status: string; imageUrl?: string; message?: string; regensLeft?: number }) {
    setStatus(e.status)
    if (e.status === 'done' && e.imageUrl) {
      setResult(e.imageUrl)
      if (typeof e.regensLeft === 'number') setRegen('branding-label', e.regensLeft)
      setGenerating(false)
    }
    if (e.status === 'error') {
      setError(e.message ?? 'Error al generar')
      setGenerating(false)
    }
  }

  async function generate() {
    if (!sessionId || !packagingFormat.trim() || saving || generating) return
    setError(null)
    setResult(null)
    setSaving(true)
    try {
      // Fase 1: subir la etiqueta de referencia si el usuario eligió una nueva.
      if (refFile) {
        const fd = new FormData()
        fd.append('reference', refFile)
        const res = await fetch(`/api/generador-branding/sessions/${sessionId}/label-reference`, { method: 'POST', body: fd })
        const data = (await res.json()) as { referenceUrl?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'No se pudo subir la referencia')
        setLabelReference(data.referenceUrl ?? null)
        setRefFile(null)
      }
      // Fase 2: generar la etiqueta vía SSE.
      bodyRef.current = {
        labelData: {
          packagingFormat: packagingFormat.trim(),
          ingredients: ingredients.trim(),
          netWeight: netWeight.trim(),
          units: units.trim(),
          highlight: highlight.trim(),
        },
        prompt: prompt.trim() || undefined,
      }
      setStatus('generating')
      setGenerating(true)
      sseKey.current += 1
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#bdbdbd]">
        Dinos cómo se presenta el producto y qué datos lleva la etiqueta. Diseñamos el arte impreso listo para usar.
      </p>

      <FieldGroup
        type="input" id="packagingFormat" label="¿En qué formato se presenta?" required
        placeholder="Ej: frasco de vidrio, bolsa doypack, pote 250ml, caja"
        value={packagingFormat} onChange={setPackagingFormat}
      />
      <FieldGroup
        type="input" id="netWeight" label="Peso / contenido neto" helper="(opcional)"
        placeholder="Ej: 100 g, 500 ml"
        value={netWeight} onChange={setNetWeight}
      />
      <FieldGroup
        type="input" id="units" label="Unidades / cantidad" helper="(opcional)"
        placeholder="Ej: 12 unidades, 1 unidad"
        value={units} onChange={setUnits}
      />
      <FieldGroup
        type="textarea" id="ingredients" label="Ingredientes / composición" helper="(opcional)"
        placeholder="Ej: pulpa de mango, azúcar de caña, pectina, ácido cítrico"
        rows={2}
        value={ingredients} onChange={setIngredients}
      />
      <FieldGroup
        type="input" id="highlight" label="Sabor / variedad / eslogan" helper="(opcional)"
        placeholder="Ej: sabor maracuyá, sin azúcar añadida"
        value={highlight} onChange={setHighlight}
      />

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-[#f5f5f5]">
          Etiqueta de referencia <span className="text-[#8a8a8a] font-normal ml-1.5">(opcional)</span>
        </label>
        <p className="text-[12px] text-[#8a8a8a]">
          Sube una etiqueta que te guste. Tip: busca tu producto entre los más vendidos en Amazon y sube una captura para diseñar según las convenciones del rubro.
        </p>
        <FileUpload label="Sube una etiqueta de referencia" onFile={onRefFile} preview={refPreview} variant="ghost" />
      </div>

      {generating && (
        <>
          <SSEStatus
            key={sseKey.current}
            url={`/api/generador-branding/sessions/${sessionId}/label`}
            body={bodyRef.current}
            onEvent={handleEvent}
          />
          <p className="text-[12px] text-[#bdbdbd]">{STATUS_TEXT[status] ?? 'Generando...'}</p>
          <div className="aspect-square max-h-[320px] rounded-2xl bg-[#141414] animate-pulse border border-white/[0.06]" />
        </>
      )}

      {error && !generating && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
      )}

      {result && !generating && (
        <>
          <img src={result} alt="Etiqueta generada" className="w-full rounded-2xl border border-white/[0.08]" />
          <button onClick={() => setLabel({ labelData: bodyRef.current.labelData, labelUrl: result })} className={btnPrimary + ' h-11 w-full'}>
            Usar esta etiqueta →
          </button>
          <RegenControls
            regensLeft={regens['branding-label'] ?? 3}
            prompt={prompt}
            onPromptChange={setPrompt}
            onRegenerate={generate}
            busy={saving || generating}
          />
        </>
      )}

      {!generating && !result && (
        <button onClick={generate} disabled={!packagingFormat.trim() || saving} className={btnPrimary + ' h-11 w-full'}>
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Preparando...
            </>
          ) : labelUrl ? 'Generar nueva etiqueta' : 'Generar etiqueta'}
        </button>
      )}
    </div>
  )
}
