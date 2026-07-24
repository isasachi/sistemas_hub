'use client'

import { RotateCcw } from 'lucide-react'

const CONFIRM_MSG = '¿Reiniciar la sesión? Se perderá el progreso actual.'

/**
 * Botón compartido para reiniciar la sesión/progreso de una tool en cualquier
 * momento (no solo al terminar). Confirma antes de descartar trabajo en curso
 * y delega el reset real a `onReset` (cada tool sabe cómo limpiar la suya:
 * store de zustand + localStorage, o estado local + query param).
 */
export function ResetSessionButton({
  onReset,
  label = 'Reiniciar',
}: {
  onReset: () => void
  label?: string
}) {
  function handleClick() {
    if (!window.confirm(CONFIRM_MSG)) return
    onReset()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Reiniciar sesión"
      className="flex items-center gap-1.5 text-[12px] font-medium text-[#94a3b8] hover:text-[#f1f5f9] transition-colors cursor-pointer bg-transparent border-0 px-2 py-1 rounded-lg hover:bg-white/[0.05]"
    >
      <RotateCcw className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

export default ResetSessionButton
