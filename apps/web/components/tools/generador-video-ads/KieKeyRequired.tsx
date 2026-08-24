import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { currentKieKey } from '@/lib/user-settings'

/**
 * Gate de la tool de video: sin API key de KIE del usuario no se entra.
 *
 * ⚠️ Va acá y no solo en el paso de render a propósito. El análisis de la referencia
 * (FASE 1) lo paga el HUB (Gemini) y el avatar es la primera llamada a KIE: dejar
 * entrar a alguien sin key le hace gastar el análisis caro para chocarse contra el
 * muro tres pasos después. Un solo chequeo cubre todo lo que se gasta río abajo.
 *
 * Es un componente de servidor: el candado no depende de nada que el cliente pueda
 * decidir. Las rutas de API vuelven a exigir la key por su cuenta (ver `SIN_KEY`).
 */
export default async function KieKeyRequired({ children }: { children: React.ReactNode }) {
  if (await currentKieKey()) return <>{children}</>

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-5 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#BD1347]/15 text-[#E8467A]">
        <KeyRound className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <h1 className="text-[22px] font-semibold text-[#F6F2EB]">Falta tu API key de KIE</h1>
      <p className="text-[13.5px] leading-relaxed text-[#c9b4ae]">
        El video se renderiza con tu propia cuenta de KIE — por eso esta herramienta viene
        incluida en los tres planes y no consume tus créditos de imagen. Crea tu key en{' '}
        <span className="text-[#F6F2EB]">kie.ai</span>, guárdala en Mi cuenta y vuelve.
      </p>
      <Link
        href="/cuenta"
        className="jr-cta flex items-center justify-center rounded-xl px-5 py-2.5 text-[14px] no-underline"
      >
        Cargar mi API key
      </Link>
    </div>
  )
}
