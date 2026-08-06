'use client'

// Se muestra cuando startNewSession falló (sessionId quedó null). Antes el wizard
// se veía como un acordeón con el cuerpo en blanco, sin error ni salida.
export function SessionErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-xl mx-auto w-full px-4 py-16 flex flex-col items-center gap-4 text-center">
      <p className="text-[14px] text-[#ededed] font-semibold">No se pudo iniciar la sesión</p>
      <p className="text-[13px] text-[#cfcfcf]">Revisa tu conexión e inténtalo de nuevo.</p>
      <button
        onClick={onRetry}
        className="jr-cta h-11 px-6 rounded-xl text-[13px] font-bold cursor-pointer border-0"
      >
        Reintentar
      </button>
    </div>
  )
}
