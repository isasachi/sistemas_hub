import Link from 'next/link'
import { Compass, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-56px)] md:min-h-screen flex items-center justify-center px-6 py-16 jr-grid">
      <div className="jr-card lp-leak jr-rise w-full max-w-[460px] rounded-2xl p-8 text-center">
        <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <Compass className="h-7 w-7 text-[#e8dcd6]" />
        </div>
        <h1 className="relative mb-2.5 text-[22px] text-[#f6f2eb]">Esta página no existe</h1>
        <p className="relative mb-7 font-[Lato] text-[14px] leading-[1.6] text-[#c9b4ae]">
          La herramienta que buscas cambió de dirección o todavía no está publicada. En el dashboard
          están todas las que puedes usar hoy.
        </p>
        <Link href="/dashboard" className="jr-cta relative rounded-full px-5 py-2.5 text-[14px] no-underline">
          <ArrowLeft className="h-4 w-4" /> Ver mis herramientas
        </Link>
      </div>
    </div>
  )
}
