'use client'

import { useRef, useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { SSEStatus } from '@/components/tools/ui/SSEStatus'
import { RegenControls } from '@/components/tools/ui/RegenControls'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

type Phase = 'idle' | 'composing' | 'deriving' | 'done' | 'error'

// Marca (compose-first, identidad fija, migración fase 10): auto-orquesta
// compose→derive sin paso de selección de variante (N=1, sin paleta):
// 1. compose (SSE) genera 1 mockup compuesto (etiqueta + logo integrados).
// 2. al terminar, deriva AUTOMÁTICAMENTE derive({target:'both'}) del mockup
//    recién generado → logo + etiqueta consistentes con él.
// 3. muestra los 3 juntos con regen individual (logo/etiqueta = derive target;
//    mockup = "regenerar mockup" rehace TODA la cadena, compose→derive both).
//
// Fallo parcial (8.3): si derive({target:'both'}) devuelve un artefacto null,
// se muestra igual lo que sí llegó + un botón "reintentar" para el que falló
// (mismo endpoint que el regen individual).
//
// Anti-regen-en-reopen: si el store YA tiene mockup+logo+label (sesión
// retomada con los 3 artefactos completos), arranca en 'done' sin llamar a
// ningún endpoint pago. Si falta cualquiera, arranca en 'idle' (rehace la
// cadena completa — no hay forma barata de reanudar a mitad de camino).
function initialPhase(mockupUrl: string | null, logoUrl: string | null, labelUrl: string | null): Phase {
  return mockupUrl && logoUrl && labelUrl ? 'done' : 'idle'
}

// `onGuide` (provisto por BrandingWizard) persiste step:3 en la sesión (high-water
// mark) antes de avanzar a la Guía — ver nota en BrandingWizard.
export default function Section4Marca({ onGuide }: { onGuide: () => void }) {
  const {
    sessionId, mockupUrl, logoUrl, labelUrl,
    setMockup, setDerived, setLogo, setLabel,
    regens, setRegen,
  } = useBrandingStore()

  const [phase, setPhase] = useState<Phase>(() => initialPhase(mockupUrl, logoUrl, labelUrl))
  const [error, setError] = useState<string | null>(null)
  const [deriveErrors, setDeriveErrors] = useState<{ logo: string | null; label: string | null }>({ logo: null, label: null })
  const [busy, setBusy] = useState(false)
  // Prompt de precisión separado por artefacto — regenerar el logo no debe
  // arrastrar el ajuste que el usuario tipeó para la etiqueta (o el mockup).
  const [mockupPrompt, setMockupPrompt] = useState('')
  const [logoPrompt, setLogoPrompt] = useState('')
  const [labelPrompt, setLabelPrompt] = useState('')
  const sseKey = useRef(0)

  // Deriva logo+etiqueta a partir de un mockup ya compuesto. Se llama tanto
  // automáticamente (al terminar compose) como para reintentar solo lo que falló.
  async function deriveBoth(srcMockupUrl: string) {
    if (!sessionId) return
    setPhase('deriving')
    setError(null)
    try {
      const res = await fetch(`/api/generador-branding/sessions/${sessionId}/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupUrl: srcMockupUrl, target: 'both' }),
      })
      const data = (await res.json()) as {
        mockupUrl?: string; logoUrl?: string | null; labelUrl?: string | null
        errors?: { logo: string | null; label: string | null }; error?: string
      }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo derivar la marca')
      if (data.logoUrl && data.labelUrl) {
        setDerived({ logoUrl: data.logoUrl, labelUrl: data.labelUrl, mockupUrl: srcMockupUrl })
        setDeriveErrors({ logo: null, label: null })
      } else {
        // Fallo parcial: conserva lo que sí llegó, guarda el/los error(es) para
        // ofrecer reintento por artefacto — el mockup NUNCA se pierde.
        setMockup(srcMockupUrl)
        if (data.logoUrl) setLogo(data.logoUrl)
        if (data.labelUrl) setLabel(data.labelUrl)
        setDeriveErrors({ logo: data.errors?.logo ?? null, label: data.errors?.label ?? null })
      }
      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  // Evento SSE de /compose: N=1, un solo mockup en `images[0]`. Al terminar,
  // auto-encadena la derivación — sin paso de "elegir variante".
  function handleComposeEvent(e: { status: string; images?: string[]; message?: string; regensLeft?: number }) {
    if (e.status === 'done' && e.images?.[0]) {
      const url = e.images[0]
      setMockup(url)
      if (typeof e.regensLeft === 'number') setRegen('branding-mockup', e.regensLeft)
      deriveBoth(url)
    }
    if (e.status === 'error') {
      setError(e.message ?? 'Error al generar el mockup')
      setPhase('error')
    }
  }

  // Botón inicial y "regenerar mockup": rehace TODA la cadena compose→derive.
  function composeChain() {
    if (!sessionId || busy || phase === 'composing' || phase === 'deriving') return
    setError(null)
    setDeriveErrors({ logo: null, label: null })
    setPhase('composing')
    sseKey.current += 1
  }

  async function retryPart(target: 'logo' | 'label') {
    if (!sessionId || busy || !mockupUrl) return
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
        setDeriveErrors((d) => ({ ...d, logo: null }))
        if (typeof data.regensLeft === 'number') setRegen('branding-logo', data.regensLeft)
      }
      if (target === 'label' && data.labelUrl) {
        setLabel(data.labelUrl)
        setDeriveErrors((d) => ({ ...d, label: null }))
        if (typeof data.regensLeft === 'number') setRegen('branding-label', data.regensLeft)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      {phase === 'idle' && (
        <>
          <p className="text-[13px] text-[#bdbdbd]">
            Generamos tu producto ya montado (etiqueta + logo integrados) fiel a tu estilo, y de ahí derivamos el logo
            y la etiqueta por separado.
          </p>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
          )}
          <button onClick={composeChain} className={btnPrimary + ' h-11 w-full'}>
            Generar mi marca
          </button>
        </>
      )}

      {(phase === 'composing' || phase === 'deriving') && (
        <>
          {phase === 'composing' && (
            <SSEStatus
              key={sseKey.current}
              url={`/api/generador-branding/sessions/${sessionId}/compose`}
              body={{ prompt: mockupPrompt.trim() || undefined }}
              onEvent={handleComposeEvent}
            />
          )}
          <div className="flex flex-col items-center gap-3 py-8">
            <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-[12px] text-[#bdbdbd]">
              {phase === 'composing' ? 'Componiendo el mockup…' : 'Derivando logo y etiqueta…'}
            </p>
          </div>
        </>
      )}

      {phase === 'error' && (
        <>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">
            {error ?? 'Ocurrió un error'}
          </div>
          {/* Si el mockup ya se generó y solo falló la derivación (error de red,
              no fallo parcial del backend — ese caso lo maneja `done`), reintenta
              SOLO la derivación en vez de re-quemar el mockup de nuevo. */}
          <button
            onClick={() => (mockupUrl ? deriveBoth(mockupUrl) : composeChain())}
            className={btnPrimary + ' h-11 w-full'}
          >
            Reintentar
          </button>
        </>
      )}

      {phase === 'done' && (
        <>
          <p className="text-[13px] text-[#bdbdbd]">Tu marca está lista. Puedes regenerar cualquier pieza por separado.</p>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
          )}

          {mockupUrl && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Mockup</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mockupUrl} alt="Mockup" className="w-full rounded-2xl border border-white/[0.08]" />
              <RegenControls
                regensLeft={regens['branding-mockup'] ?? 3}
                prompt={mockupPrompt}
                onPromptChange={setMockupPrompt}
                onRegenerate={composeChain}
                busy={busy}
                label="↻ Regenerar mockup"
              />
            </div>
          )}

          {logoUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Logo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo derivado" className="w-full max-w-[220px] rounded-2xl border border-white/[0.08]" />
              <RegenControls
                regensLeft={regens['branding-logo'] ?? 3}
                prompt={logoPrompt}
                onPromptChange={setLogoPrompt}
                onRegenerate={() => retryPart('logo')}
                busy={busy}
                label="↻ Regenerar logo"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Logo</p>
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">
                {deriveErrors.logo ?? 'No se pudo generar el logo'}
              </div>
              <button onClick={() => retryPart('logo')} disabled={busy} className={btnPrimary + ' h-10'}>
                {busy ? 'Reintentando...' : 'Reintentar logo'}
              </button>
            </div>
          )}

          {labelUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Etiqueta</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={labelUrl} alt="Etiqueta derivada" className="w-full rounded-2xl border border-white/[0.08]" />
              <RegenControls
                regensLeft={regens['branding-label'] ?? 3}
                prompt={labelPrompt}
                onPromptChange={setLabelPrompt}
                onRegenerate={() => retryPart('label')}
                busy={busy}
                label="↻ Regenerar etiqueta"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Etiqueta</p>
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">
                {deriveErrors.label ?? 'No se pudo generar la etiqueta'}
              </div>
              <button onClick={() => retryPart('label')} disabled={busy} className={btnPrimary + ' h-10'}>
                {busy ? 'Reintentando...' : 'Reintentar etiqueta'}
              </button>
            </div>
          )}

          <button onClick={onGuide} disabled={busy || !logoUrl || !labelUrl} className={btnPrimary + ' h-11 w-full'}>
            Continuar a la guía →
          </button>
        </>
      )}
    </div>
  )
}
