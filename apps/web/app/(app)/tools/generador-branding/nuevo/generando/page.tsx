'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, X } from 'lucide-react'
import { readSSEStream } from '@/components/tools/ui/SSEStatus'
import { useBrief } from '@/components/tools/generador-branding/nuevo/BriefShell'
import { STEPS, isComplete, resumePath, saveLastSession } from '@/lib/branding/brief'
import { STAGE_LABELS, type Stage } from '@/lib/branding/generation'

// El board primero; las dos piezas sueltas se derivan de él.
type Step = Stage
const STEPS_UI: Step[] = ['brandbook', 'logo', 'empaque']
const LABELS: Record<Step, string> = STAGE_LABELS

const TIPS = [
  'Las tipografías las elige el modelo: es parte de lo que hace única a cada marca.',
  'Primero sale el brandbook completo; de ahí se derivan el logo y el empaque sueltos.',
  'Si algo no te convence, puedes regenerar solo esa pieza sin rehacer el resto.',
  'El texto del empaque sale en español, con formato peruano.',
  'El logo y el empaque sueltos se sacan del mismo board, así que son la misma marca.',
]

type State = 'pending' | 'running' | 'done' | 'failed'

export default function GenerandoPage() {
  const router = useRouter()
  const { brief } = useBrief()
  const [state, setState] = useState<Record<Step, State>>({ brandbook: 'pending', logo: 'pending', empaque: 'pending' })
  const [error, setError] = useState<string | null>(null)
  const [tip, setTip] = useState(0)
  const [slow, setSlow] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const started = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    if (brief && !isComplete(brief)) router.replace(resumePath(brief))
  }, [brief, router])

  useEffect(() => {
    // `alive` se re-arma en cada montaje: sin esto, el doble efecto de StrictMode
    // lo dejaba en false para siempre y el redirect automático al resultado NUNCA
    // ocurría — había que apretar "seguir en segundo plano" a mano.
    alive.current = true
    const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 8000)
    const slowTimer = setTimeout(() => setSlow(true), 60_000)
    return () => { clearInterval(t); clearTimeout(slowTimer); alive.current = false }
  }, [])

  // Dispara la generación UNA vez. El ref sobrevive al doble efecto de StrictMode:
  // sin él, cada montaje en dev dispararía una corrida entera (3 imágenes pagadas).
  // A propósito sin AbortController: si el usuario navega al resultado, la corrida
  // sigue y las piezas se van guardando en la sesión.
  useEffect(() => {
    if (!brief || !isComplete(brief) || started.current) return
    started.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/generador-branding/generar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brief }),
        })
        await readSSEStream(res, (e) => {
          const ev = e as unknown as { status: string; stage?: Step; sessionId?: string; message?: string }
          if (ev.status === 'session' && ev.sessionId) {
            setSessionId(ev.sessionId)
            saveLastSession(ev.sessionId)
          }
          if (ev.status === 'stage' && ev.stage) setState((s) => ({ ...s, [ev.stage!]: 'running' }))
          if (ev.status === 'stage_done' && ev.stage) setState((s) => ({ ...s, [ev.stage!]: 'done' }))
          if (ev.status === 'stage_failed' && ev.stage) setState((s) => ({ ...s, [ev.stage!]: 'failed' }))
          if (ev.status === 'error') setError(ev.message ?? 'Falló la generación')
          if (ev.status === 'done' && ev.sessionId && alive.current) {
            router.replace(`/tools/generador-branding/nuevo/resultado?s=${ev.sessionId}`)
          }
        })
      } catch (err) {
        setError(String(err))
      }
    })()
  }, [brief, router])

  if (!brief || !isComplete(brief)) return null

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-6 py-4">
        <Link href={STEPS[4].path} className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-white/[0.1] text-[13px] font-semibold text-[#f5f5f5] no-underline hover:bg-white/[0.05] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Atrás
        </Link>
      </div>

      <div className="flex-1 w-full max-w-[560px] mx-auto px-6 pb-10 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] font-bold text-[#f5f5f5] leading-tight">
            Creando la marca de {brief.brandName}
          </h1>
          <p className="text-[13px] text-[#bdbdbd]">Toma alrededor de un minuto por pieza.</p>
        </div>

        <div className="flex flex-col gap-2">
          {STEPS_UI.map((s, i) => {
            const st = state[s]
            return (
              <div key={s} className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                st === 'running' ? 'border-[rgba(255,156,77,0.4)] bg-[rgba(255,156,77,0.06)]'
                : st === 'done' ? 'border-[rgba(44,207,111,0.25)]'
                : st === 'failed' ? 'border-red-500/30' : 'border-white/[0.06]'
              }`}>
                <span className="w-[22px] h-[22px] rounded-full border border-white/[0.12] bg-white/[0.03] flex items-center justify-center readout text-[11px] font-bold text-[#8a8a8a]">
                  {st === 'done' ? <Check className="w-3 h-3 text-[#2ccf6f]" strokeWidth={3} />
                    : st === 'failed' ? <X className="w-3 h-3 text-red-400" strokeWidth={3} />
                    : st === 'running' ? <span className="w-3 h-3 border-2 border-white/20 border-t-[#ff9c4d] rounded-full animate-spin" />
                    : i + 1}
                </span>
                <span className="text-[13px] text-[#f5f5f5] flex-1">{LABELS[s]}</span>
                <span className="text-[11px] text-[#8a8a8a]">
                  {st === 'done' ? 'listo' : st === 'running' ? 'generando...' : st === 'failed' ? 'falló' : 'pendiente'}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-[12px] text-[#8a8a8a] leading-relaxed">{TIPS[tip]}</p>

        {slow && sessionId && (
          <button type="button"
                  onClick={() => router.push(`/tools/generador-branding/nuevo/resultado?s=${sessionId}`)}
                  className="h-11 px-5 self-start rounded-xl border border-white/[0.14] text-[13px] font-semibold text-[#f5f5f5] hover:bg-white/[0.05] transition-colors cursor-pointer bg-transparent">
            Seguir en segundo plano
          </button>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">{error}</div>
        )}
      </div>
    </div>
  )
}
