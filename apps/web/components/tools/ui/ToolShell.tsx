import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ResetSessionButton } from "./ResetSessionButton";

const crumbLink =
  "font-sans text-[#bebebe] hover:text-[#ffffff] transition-colors duration-200 no-underline";

/**
 * Chrome de las pantallas de tool que NO son el asistente: entrada, historial y
 * sesiones guardadas. El asistente por pasos usa StepWizard, que trae su propia
 * barra (riel + reiniciar) — nunca anides los dos o salen dos barras.
 *
 * - Sin `trail`: Dashboard › {name}  (páginas de entrada).
 * - Con `trail`: Dashboard › {name}(link) › {trail}  (sesión).
 * - `onReset` (opcional): botón "Reiniciar" al extremo derecho, mismo lugar en
 *   todas las tools y clickeable en cualquier momento.
 */
export default function ToolShell({
  name,
  slug,
  trail,
  onReset,
  children,
}: {
  name: string;
  slug: string;
  trail?: string;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c0d]">
      <nav className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0c0c0d]/85 px-5 py-3.5 text-[13px] backdrop-blur-xl md:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/dashboard" className={crumbLink}>
            Dashboard
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#bebebe]/50" />
          {trail ? (
            <>
              <Link href={`/tools/${slug}`} className={`${crumbLink} truncate`}>
                {name}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#bebebe]/50" />
              <span className="truncate font-sans font-semibold text-[#ededed]">{trail}</span>
            </>
          ) : (
            <span className="truncate font-sans font-semibold text-[#ededed]">{name}</span>
          )}
        </div>
        {onReset && <ResetSessionButton onReset={onReset} />}
      </nav>
      {children}
    </div>
  );
}
