'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'

/**
 * Aviso de bienvenida para quien ya pagó pero todavía no cargó su API key de KIE: sin
 * ella el generador de video no funciona, y sin este aviso no hay forma de enterarse
 * hasta abrir la tool.
 *
 * ⚠️ El "más tarde" vive en localStorage, no en una columna. La condición que lo
 * dispara (`tiene plan` && `no tiene key`) se apaga sola en cuanto guarda la key, así
 * que no hace falta persistir nada del lado del servidor: el peor caso de perder el
 * flag —otro navegador, datos borrados— es volver a ver el aviso, que es justamente
 * lo que hay que hacer con alguien que sigue sin key.
 *
 * ponytail: por lo mismo tampoco distingue "acaba de pagar" de "lleva meses sin key" —
 * es la misma condición y el mismo aviso; detectar la recencia del pago costaría el
 * webhook de pagos, cuya forma de sobre AGENTS.md documenta como no verificada.
 */
const MAS_TARDE = 'kie_key_prompt_pospuesto'

export default function KieKeyPrompt() {
  // Arranca cerrado y se abre en el efecto: en el render del servidor no hay
  // localStorage, y pintarlo antes de leerlo haría parpadear el modal a quien ya
  // pulsó "más tarde".
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    try {
      if (!localStorage.getItem(MAS_TARDE)) setAbierto(true)
    } catch {
      /* modo privado o storage bloqueado: mejor mostrarlo que romper la pantalla */
      setAbierto(true)
    }
  }, [])

  if (!abierto) return null

  const masTarde = () => {
    try { localStorage.setItem(MAS_TARDE, '1') } catch { /* da igual: se cierra igual */ }
    setAbierto(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#2a0f1a] p-6 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#BD1347]/15 text-[#E8467A]">
          <KeyRound className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <h2 className="mb-2 text-[19px] font-semibold text-[#F6F2EB]">
          Carga tu API key de KIE
        </h2>
        <p className="mb-5 text-[13px] leading-relaxed text-[#c9b4ae]">
          El generador de video renderiza con tu propia cuenta de KIE: por eso viene
          incluido en los tres planes y no gasta tus créditos de imagen. Sin la key, esa
          herramienta queda bloqueada. El resto del hub funciona con normalidad.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/cuenta"
            onClick={masTarde}
            className="jr-cta flex items-center justify-center rounded-xl px-5 py-2.5 text-[14px] no-underline"
          >
            Cargar mi API key
          </Link>
          <button
            onClick={masTarde}
            className="rounded-xl px-5 py-2.5 text-[13px] text-[#8b8b8b] hover:text-[#c9b4ae]"
          >
            Lo hago más tarde
          </button>
        </div>
      </div>
    </div>
  )
}
