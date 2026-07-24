import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ResetSessionButton } from "./ResetSessionButton";

const crumbLink =
  "text-[#8a8a8a] hover:text-[#bdbdbd] transition-colors no-underline";

/**
 * Chrome compartido de las tools: fondo full-height + breadcrumb.
 * - Sin `trail`: Dashboard › {name}  (páginas de entrada).
 * - Con `trail`: Dashboard › {name}(link) › {trail}  (wizard / sesión).
 * El `name` se pasa explícito para preservar el texto exacto de cada tool.
 * - `onReset` (opcional): si la tool tiene sesión resettable, se muestra el
 *   botón "Reiniciar" al extremo derecho del nav — mismo lugar en todas las
 *   tools, visible/clickable en cualquier momento (no solo al terminar).
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
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <nav className="px-8 py-3.5 border-b border-white/[0.06] flex items-center justify-between gap-2 text-[13px]">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className={crumbLink}>
            Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-[#8a8a8a]" />
          {trail ? (
            <>
              <Link href={`/tools/${slug}`} className={crumbLink}>
                {name}
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-[#8a8a8a]" />
              <span className="text-[#f5f5f5] font-semibold">{trail}</span>
            </>
          ) : (
            <span className="text-[#f5f5f5] font-semibold">{name}</span>
          )}
        </div>
        {onReset && <ResetSessionButton onReset={onReset} />}
      </nav>
      {children}
    </div>
  );
}
