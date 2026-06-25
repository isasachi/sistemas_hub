import Link from 'next/link'
import { Compass, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-56px)] md:min-h-screen flex items-center justify-center px-6 py-16 jr-grid">
      <div className="jr-card rounded-2xl max-w-[460px] w-full p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
          <Compass className="w-7 h-7 text-[#ff9c4d]" />
        </div>
        <h1 className="text-[22px] font-bold text-[#f5f5f5] mb-2.5 font-[Poppins]">Página no encontrada</h1>
        <p className="text-[14px] text-[#bdbdbd] leading-[1.6] mb-7">
          Esta herramienta no existe o fue movida. Vuelve al dashboard para ver las disponibles.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#bdbdbd] border border-white/[0.12] hover:text-[#f5f5f5] hover:border-white/[0.25] hover:bg-white/[0.04] rounded-full px-5 py-2.5 no-underline transition-all duration-200"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al dashboard
        </Link>
      </div>
    </div>
  )
}
