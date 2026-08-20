'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-[calc(100vh-56px)] md:min-h-screen flex items-center justify-center px-6 py-16 jr-grid">
      <div className="jr-card lp-leak jr-rise w-full max-w-[460px] rounded-2xl p-8 text-center">
        <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <AlertTriangle className="h-7 w-7 text-[#e8dcd6]" />
        </div>
        <h1 className="relative mb-2.5 text-[22px] text-[#f6f2eb]">Algo salió mal</h1>
        <p className="relative mb-7 font-[Archivo] text-[14px] leading-[1.6] text-[#c9b4ae]">
          No pudimos cargar esta pantalla. Reintenta — si vuelve a fallar, desde el dashboard puedes
          entrar por otra herramienta.
        </p>
        <div className="relative flex items-center justify-center gap-3">
          <button onClick={reset} className="jr-cta rounded-full px-5 py-2.5 text-[14px] cursor-pointer">
            <RotateCcw className="h-4 w-4" /> Reintentar
          </button>
          <Link href="/dashboard" className="jr-btn-ghost rounded-full px-5 py-2.5 text-[14px] no-underline">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
