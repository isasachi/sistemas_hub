'use client'

import { useState } from 'react'
import { useBrandingStore } from '@/store/branding'
import { RegenControls } from '@/components/tools/ui/RegenControls'

const btnPrimary =
  'rounded-xl jr-cta text-[13px] font-bold disabled:opacity-40 transition-all duration-200 cursor-pointer border-0 font-sans flex items-center justify-center gap-2'

type Step = 'logo' | 'label' | 'mockup'
type Phase = 'idle' | Step | 'done' | 'error'

const STEP_ORDER: readonly Step[] = ['logo', 'label', 'mockup']
const STEP_NAME: Record<Step, string> = { logo: 'el logo', label: 'la etiqueta', mockup: 'el mockup' }
const PROGRESS_LABEL: Record<Step, string> = {
  logo: 'Generando el logo…',
  label: 'Componiendo la etiqueta…',
  mockup: 'Renderizando el mockup…',
}
const QUOTA_KIND: Record<Step, string> = {
  logo: 'branding-logo',
  label: 'branding-label',
  mockup: 'branding-mockup',
}

// Marca (pipeline SECUENCIAL, identidad fija, migración jul 2026): auto-orquesta
// logo → etiqueta → mockup, cada paso una llamada JSON independiente:
// 1. POST /logo   → genera el logo aislado en la identidad del estilo.
// 2. POST /label  → recibe el logo generado + el wireframe + los pares de
//    contraste, e inserta el logo en la etiqueta con equilibrio y legibilidad.
// 3. POST /mockup → recibe la etiqueta generada y la aplica al envase.
//
// `runSteps(steps)` corre una lista de pasos secuencialmente. "Generar mi marca"
// y "reintentar" usan `runFrom` (cadena completa desde un punto). Los regen son
// TARGETED según dependencia real: el logo es un asset INDEPENDIENTE (la etiqueta
// arma su wordmark con el nombre de producto, no usa el logo) → regen logo = solo
// logo; regen etiqueta = etiqueta+mockup (el mockup aplica la etiqueta); regen
// mockup = solo mockup.
//
// Anti-regen-en-reopen: si el store YA tiene logo+etiqueta+mockup (sesión
// retomada con los 3 artefactos completos), arranca en 'done' sin llamar a
// ningún endpoint pago. Si falta cualquiera, arranca en 'idle' (rehace la
// cadena completa desde el logo — no hay forma barata de reanudar a mitad).
function initialPhase(logoUrl: string | null, labelUrl: string | null, mockupUrl: string | null): Phase {
  return logoUrl && labelUrl && mockupUrl ? 'done' : 'idle'
}

// `onGuide` (provisto por BrandingWizard) persiste step:3 en la sesión (high-water
// mark) antes de avanzar a la Guía — ver nota en BrandingWizard.
export default function Section4Marca({ onGuide }: { onGuide: () => void }) {
  const {
    sessionId, logoUrl, labelUrl, mockupUrl,
    setLogo, setLabel, setMockup,
    regens, setRegen,
  } = useBrandingStore()

  const [phase, setPhase] = useState<Phase>(() => initialPhase(logoUrl, labelUrl, mockupUrl))
  const [error, setError] = useState<string | null>(null)
  const [failedStep, setFailedStep] = useState<Step | null>(null)
  const [busy, setBusy] = useState(false)
  // Prompt de precisión separado por artefacto — regenerar el logo no debe
  // arrastrar el ajuste que el usuario tipeó para la etiqueta (o el mockup).
  const [logoPrompt, setLogoPrompt] = useState('')
  const [labelPrompt, setLabelPrompt] = useState('')
  const [mockupPrompt, setMockupPrompt] = useState('')

  const promptFor = (step: Step) => (step === 'logo' ? logoPrompt : step === 'label' ? labelPrompt : mockupPrompt)

  // Corre una lista de pasos secuencialmente, persistiendo cada URL. El mockup
  // lee label_url ya persistido en DB, así que "nueva etiqueta → mockup ve esa
  // etiqueta". El LOGO es un asset INDEPENDIENTE (la etiqueta arma su propio
  // wordmark con el nombre de producto, no usa el logo) → regenerar el logo NO
  // re-corre etiqueta/mockup.
  async function runSteps(steps: readonly Step[]) {
    if (!sessionId || busy) return
    setBusy(true)
    setError(null)
    setFailedStep(null)

    for (const step of steps) {
      setPhase(step)
      try {
        const res = await fetch(`/api/generador-branding/sessions/${sessionId}/${step}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptFor(step).trim() || undefined }),
        })
        const data = (await res.json()) as {
          logoUrl?: string; labelUrl?: string; mockupUrl?: string
          regensLeft?: number; error?: string
        }
        if (!res.ok) throw new Error(data.error ?? `No se pudo generar ${STEP_NAME[step]}`)
        if (step === 'logo' && data.logoUrl) setLogo(data.logoUrl)
        if (step === 'label' && data.labelUrl) setLabel(data.labelUrl)
        if (step === 'mockup' && data.mockupUrl) setMockup(data.mockupUrl)
        if (typeof data.regensLeft === 'number') setRegen(QUOTA_KIND[step], data.regensLeft)
      } catch (err) {
        setError((err as Error).message)
        setFailedStep(step)
        setPhase('error')
        setBusy(false)
        return
      }
    }
    setPhase('done')
    setBusy(false)
  }

  // Cadena completa desde un punto: "Generar mi marca" (desde 'logo') y el
  // "reintentar" tras un fallo (desde el paso que falló).
  const runFrom = (start: Step) => runSteps(STEP_ORDER.slice(STEP_ORDER.indexOf(start)))

  if (!sessionId) return null

  return (
    <div className="flex flex-col gap-4">
      {phase === 'idle' && (
        <>
          <p className="text-[13px] text-[#bdbdbd]">
            Generamos primero el logo, luego lo insertamos en la etiqueta con contraste y composición equilibrada, y
            por último aplicamos esa etiqueta al mockup del envase.
          </p>
          <button onClick={() => runFrom('logo')} disabled={busy} className={btnPrimary + ' h-11 w-full'}>
            Generar mi marca
          </button>
        </>
      )}

      {(phase === 'logo' || phase === 'label' || phase === 'mockup') && (
        <div className="flex flex-col items-center gap-3 py-8">
          <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-[12px] text-[#bdbdbd]">{PROGRESS_LABEL[phase]}</p>
        </div>
      )}

      {phase === 'error' && (
        <>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">
            {error ?? 'Ocurrió un error'}
          </div>
          {/* Reintenta DESDE el paso que falló — los pasos previos exitosos ya
              quedaron persistidos (URL en DB + store) y no se re-queman. */}
          <button onClick={() => runFrom(failedStep ?? 'logo')} disabled={busy} className={btnPrimary + ' h-11 w-full'}>
            Reintentar
          </button>
        </>
      )}

      {phase === 'done' && (
        <>
          <p className="text-[13px] text-[#bdbdbd]">Tu marca está lista. Puedes regenerar cualquier pieza por separado.</p>

          {logoUrl && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Logo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="w-full max-w-[220px] rounded-2xl border border-white/[0.08]" />
              <RegenControls
                regensLeft={regens['branding-logo'] ?? 3}
                prompt={logoPrompt}
                onPromptChange={setLogoPrompt}
                onRegenerate={() => runSteps(['logo'])}
                busy={busy}
                label="↻ Regenerar logo"
              />
            </div>
          )}

          {labelUrl && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a8a8a]">Etiqueta</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={labelUrl} alt="Etiqueta" className="w-full rounded-2xl border border-white/[0.08]" />
              <RegenControls
                regensLeft={regens['branding-label'] ?? 3}
                prompt={labelPrompt}
                onPromptChange={setLabelPrompt}
                onRegenerate={() => runSteps(['label', 'mockup'])}
                busy={busy}
                label="↻ Regenerar etiqueta"
              />
            </div>
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
                onRegenerate={() => runSteps(['mockup'])}
                busy={busy}
                label="↻ Regenerar mockup"
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
