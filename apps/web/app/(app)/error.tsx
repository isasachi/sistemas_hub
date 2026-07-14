'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-[calc(100vh-56px)] md:min-h-screen flex items-center justify-center px-6 py-16 jr-grid">
      <div className="jr-card rounded-2xl max-w-[460px] w-full p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7 text-[#ff9c4d]" />
        </div>
        <h1 className="text-[22px] font-bold text-[#f5f5f5] mb-2.5">Algo salió mal</h1>
        <p className="text-[14px] text-[#bdbdbd] leading-[1.6] mb-7">
          Ocurrió un error inesperado. Inténtalo de nuevo o vuelve al dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 jr-cta text-[14px] font-bold rounded-full px-5 py-2.5 border-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> Reintentar
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#bdbdbd] border border-white/[0.12] hover:text-[#f5f5f5] hover:border-white/[0.25] hover:bg-white/[0.04] rounded-full px-5 py-2.5 no-underline transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
