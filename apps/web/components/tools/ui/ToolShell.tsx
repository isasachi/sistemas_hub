import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ResetSessionButton } from "./ResetSessionButton";

/**
 * Chrome de las pantallas de tool que NO son el asistente: entrada y sesiones
 * guardadas. El asistente por pasos usa StepWizard, que trae su propia barra
 * (riel + reiniciar) — nunca anides los dos o salen dos barras.
 *
 * Una sola salida, siempre en el mismo sitio: "Volver al dashboard". El
 * breadcrumb encadenado se retiró — con dos niveles de profundidad no orientaba
 * más que un botón y sí daba dos destinos distintos donde solo hace falta uno.
 * `trail` (p. ej. "Sesión") queda como rótulo plano, no como enlace.
 */
export default function ToolShell({
  name,
  trail,
  onReset,
  children,
}: {
  name: string;
  /** Se acepta por compatibilidad con las páginas que lo pasan; ya no enlaza. */
  slug?: string;
  trail?: string;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c0d]">
      <nav className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0c0c0d]/85 px-5 py-3 backdrop-blur-xl md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" className="jr-btn-ghost h-9 shrink-0 rounded-xl px-3.5 text-[13px] no-underline">
            <ArrowLeft className="h-4 w-4" />
            Volver al dashboard
          </Link>
          <span className="hidden h-4 w-px shrink-0 bg-white/[0.1] sm:block" />
          <span className="hidden truncate font-sans text-[13px] font-semibold text-[#ededed] sm:block">
            {trail ? `${name} · ${trail}` : name}
          </span>
        </div>
        {onReset && <ResetSessionButton onReset={onReset} />}
      </nav>
      {children}
    </div>
  );
}
