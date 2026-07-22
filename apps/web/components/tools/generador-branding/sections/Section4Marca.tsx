'use client'

import { useRef, useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'
import { RegenControls } from '@/components/tools/ui/RegenControls'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

type Phase = 'idle' | 'composing' | 'choosing' | 'derived'

// Marca (compose-first, unifica los viejos pasos Logo/Etiqueta/Mockup):
// 1. compose (SSE) genera 3 variantes del mockup compuesto → elegir una.
// 2. derive({target:'both'}) deriva logo+etiqueta del mockup elegido → los 3
//    quedan consistentes entre sí (mismo logo, misma etiqueta).
// 3. derived: muestra los 3 con regen individual (derive target:'logo'|'label',
//    o volver a 'choosing' para cambiar de mockup — re-deriva ambos).
//
// Hidratación en reopen (anti-regen-en-reopen, mismo patrón que las secciones
// viejas): si el store YA tiene mockup+logo+label, arranca en 'derived' sin
// llamar a ningún endpoint pago; si solo hay mockupOptions sin elegir, arranca
// en 'choosing'; si no hay nada, 'idle'.
function initialPhase(mockupUrl: string | null, logoUrl: string | null, labelUrl: string | null, mockupOptions: string[]): Phase {
  if (mockupUrl && logoUrl && labelUrl) return 'derived'
  if (mockupOptions.length > 0) return 'choosing'
  return 'idle'
}

// `onGuide` (provisto por BrandingWizard) persiste step:4 en la sesión (high-water
// mark) antes de avanzar a la Guía — ver nota en BrandingWizard.
export default function Section4Marca({ onGuide }: { onGuide: () => void }) {
  const {
    sessionId, mockupOptions, mockupUrl, logoUrl, labelUrl,
    setMockupOptions, setDerived, setLogo, setLabel,
    regens, setRegen,
  } = useBrandingStore()

  const [phase, setPhase] = useState<Phase>(() => initialPhase(mockupUrl, logoUrl, labelUrl, mockupOptions))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Prompt de precisión separado por artefacto — regenerar el logo no debe
  // arrastrar el ajuste que el usuario tipeó para la etiqueta (o el mockup).
  const [mockupPrompt, setMockupPrompt] = useState('')
  const [logoPrompt, setLogoPrompt] = useState('')
  const [labelPrompt, setLabelPrompt] = useState('')
  const sseKey = useRef(0)
  // Mockup elegido mientras se deriva (para resaltarlo en el grid durante `busy`).
  const [pendingMockup, setPendingMockup] = useState<string | null>(mockupUrl)

  function handleComposeEvent(e: { status: string; images?: string[]; message?: string; done?: number; total?: number; regensLeft?: number }) {
    if (e.status === 'progress' && typeof e.done === 'number' && typeof e.total === 'number') {
      setProgress({ done: e.done, total: e.total })
    }
    if (e.status === 'done' && e.images) {
      setMockupOptions(e.images)
      if (typeof e.regensLeft === 'number') setRegen('branding-mockup', e.regensLeft)
      setPhase('choosing')
    }
    if (e.status === 'error') {
      setError(e.message ?? 'Error al generar')
      setPhase('idle')
    }
  }

  function compose() {
    if (!sessionId || phase === 'composing') return
    setError(null)
    setProgress(null)
    setMockupOptions([])
    setPhase('composing')
    sseKey.current += 1
  }

  async function choose(url: string) {
    if (!sessionId || busy) return
    setBusy(true)
    setPendingMockup(url)
    setError(null)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupUrl: url, target: 'both' }),
      })
      const data = (await res.json()) as { logoUrl?: string; labelUrl?: string; mockupUrl?: string; error?: string }
      if (!res.ok || !data.logoUrl || !data.labelUrl || !data.mockupUrl) throw new Error(data.error ?? 'No se pudo derivar la marca')
      setDerived({ logoUrl: data.logoUrl, labelUrl: data.labelUrl, mockupUrl: data.mockupUrl })
      setPhase('derived')
    } catch (err) {
      setError((err as Error).message)
      setPendingMockup(mockupUrl)
    } finally {
      setBusy(false)
    }
  }

  async function regenPart(target: 'logo' | 'label') {
    if (!sessionId || busy) return
    setBusy(true)
    setError(null)
    const precision = target === 'logo' ? logoPrompt : labelPrompt
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, prompt: precision.trim() || undefined }),
      })
      const data = (await res.json()) as { logoUrl?: string; labelUrl?: string; regensLeft?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? `No se pudo regenerar ${target === 'logo' ? 'el logo' : 'la etiqueta'}`)
      if (target === 'logo' && data.logoUrl) {
        setLogo(data.logoUrl)
        if (typeof data.regensLeft === 'number') setRegen('branding-logo', data.regensLeft)
      }
      if (target === 'label' && data.labelUrl) {
        setLabel(data.labelUrl)
        if (typeof data.regensLeft === 'number') setRegen('branding-label', data.regensLeft)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function changeMockup() {
    setPhase('choosing')
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      {phase === 'idle' && (
        <>
          <p className="text-[13px] text-[#bdbdbd]">
            Generamos 3 variantes de tu producto ya montado (etiqueta + logo integrados) fieles a tu estilo y paleta.
          </p>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
          )}
          <button onClick={compose} className={btnPrimary + ' h-11 w-full'}>
            Generar mi marca
          </button>
        </>
      )}

      {phase === 'composing' && (
        <>
          <SSEStatus
            key={sseKey.current}
            url={`/api/generador-branding/sessions/${sessionId}/compose`}
            body={{ prompt: mockupPrompt.trim() || undefined }}
            onEvent={handleComposeEvent}
          />
          <p className="text-[12px] text-[#bdbdbd]">
            {progress ? `Generando opciones... ${progress.done}/${progress.total}` : 'Generando opciones...'}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`aspect-square rounded-2xl border ${
                  progress && i < progress.done
                    ? 'border-[rgba(255,156,77,0.4)] bg-[#141414]'
                    : 'border-white/[0.06] bg-[#141414] animate-pulse'
                }`}
              />
            ))}
          </div>
        </>
      )}

      {phase === 'choosing' && (
        <>
          <p className="text-[13px] text-[#bdbdbd]">Elige el mockup que más te guste — de ahí derivamos el logo y la etiqueta.</p>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {mockupOptions.map((url) => {
              const isPending = pendingMockup === url && busy
              return (
                <button
                  key={url}
                  onClick={() => choose(url)}
                  disabled={busy}
                  className="relative aspect-square rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[rgba(255,156,77,0.5)] transition-all cursor-pointer disabled:cursor-default"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Opción de mockup" className="w-full h-full object-cover" />
                  {isPending && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <RegenControls
            regensLeft={regens['branding-mockup'] ?? 3}
            prompt={mockupPrompt}
            onPromptChange={setMockupPrompt}
            onRegenerate={compose}
            busy={busy}
            label="↻ Regenerar opciones"
          />
        </>
      )}

      {phase === 'derived' && (
        <>
          <p className="text-[13px] text-[#bdbdbd]">Tu marca está lista. Puedes regenerar cualquier pieza por separado.</p>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
          )}

          {mockupUrl && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Mockup</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mockupUrl} alt="Mockup elegido" className="w-full rounded-2xl border border-white/[0.08]" />
              <button onClick={changeMockup} disabled={busy} className="h-9 px-3 rounded-lg border border-white/[0.14] text-[#f5f5f5] text-[12px] font-medium hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent disabled:opacity-40 self-start">
                Cambiar mockup
              </button>
            </div>
          )}

          {logoUrl && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Logo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo derivado" className="w-full max-w-[220px] rounded-2xl border border-white/[0.08]" />
              <RegenControls
                regensLeft={regens['branding-logo'] ?? 3}
                prompt={logoPrompt}
                onPromptChange={setLogoPrompt}
                onRegenerate={() => regenPart('logo')}
                busy={busy}
                label="↻ Regenerar logo"
              />
            </div>
          )}

          {labelUrl && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Etiqueta</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={labelUrl} alt="Etiqueta derivada" className="w-full rounded-2xl border border-white/[0.08]" />
              <RegenControls
                regensLeft={regens['branding-label'] ?? 3}
                prompt={labelPrompt}
                onPromptChange={setLabelPrompt}
                onRegenerate={() => regenPart('label')}
                busy={busy}
                label="↻ Regenerar etiqueta"
              />
            </div>
          )}

          <button onClick={onGuide} disabled={busy} className={btnPrimary + ' h-11 w-full'}>
            Continuar a la guía →
          </button>
        </>
      )}
    </div>
  )
}
