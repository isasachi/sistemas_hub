'use client'

import { useState } from 'react'
import { Clapperboard, UserRound, Sparkles } from 'lucide-react'
import { useVideoStore } from '@/store/video'
import type { VideoMode } from '@/lib/video-ads/types'
import { errorBox } from './shared'

const OPTIONS: { mode: VideoMode; icon: typeof Clapperboard; title: string; desc: string }[] = [
  {
    mode: 'video-ref',
    icon: Clapperboard,
    title: 'Tengo un video de referencia',
    desc: 'Lo analizamos segundo a segundo y armamos tu video con la misma estructura, pero con tu producto.',
  },
  {
    mode: 'character-ref',
    icon: UserRound,
    title: 'Tengo una foto del personaje',
    desc: 'Con esa persona y tu producto escribimos el guión desde cero y grabamos el video.',
  },
  {
    mode: 'character-gen',
    icon: Sparkles,
    title: 'Créame el personaje',
    desc: 'Describes a quién quieres en cámara, lo generamos, y de ahí sale el guión y el video.',
  },
]

export default function Section0Mode() {
  const { sessionId, mode, patch, setLoading, isLoading } = useVideoStore()
  const [error, setError] = useState<string | null>(null)

  async function choose(next: VideoMode) {
    if (!sessionId || isLoading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/generador-video-ads/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!res.ok) throw new Error('No se pudo guardar tu elección')
      patch({ mode: next, step: 1 })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {OPTIONS.map(({ mode: m, icon: Icon, title, desc }) => (
        <button
          key={m}
          type="button"
          disabled={isLoading}
          onClick={() => choose(m)}
          className={[
            'flex items-start gap-3.5 rounded-2xl border px-4 py-4 text-left transition-all duration-200 cursor-pointer disabled:opacity-40',
            mode === m
              ? 'border-[rgba(255,155,74,0.4)] bg-[rgba(255,155,74,0.08)]'
              : 'border-white/[0.06] bg-[#121214] hover:border-[rgba(255,155,74,0.3)]',
          ].join(' ')}
        >
          <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#ff9b4a]" strokeWidth={1.6} />
          <span className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold text-[#ededed]">{title}</span>
            <span className="text-[12.5px] leading-relaxed text-[#8b8b8b]">{desc}</span>
          </span>
        </button>
      ))}
      {error && <div className={errorBox}>{error}</div>}
    </div>
  )
}
