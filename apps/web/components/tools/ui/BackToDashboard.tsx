import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'

/**
 * Cierre de sesión: la salida al dashboard cuando el usuario YA tiene su
 * resultado. La barra de arriba (ToolShell) también lleva ahí, pero al final de
 * una sesión larga el usuario está al pie de la pantalla, no en el header.
 */
export default function BackToDashboard({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      data-end="dashboard"
      className={`jr-btn-ghost h-11 rounded-xl px-5 text-[13px] no-underline ${className}`}
    >
      <LayoutGrid className="h-4 w-4" /> Volver al dashboard
    </Link>
  )
}
