import Link from "next/link";
import { Wordmark } from "./Wordmark";

// Navbar de la landing pública (no autenticada). El área privada usa AppShell.
// Barra granate translúcida, el lockup de dos líneas del logotipo y CTA en
// pastilla crema — el carmesí queda para la acción del hero (BRANDBOOK §2).
export function Navbar() {
  return (
    <div className="sticky top-0 z-40 border-b border-[rgba(255,255,255,0.06)] bg-[#14050a]/80 backdrop-blur-xl">
      <nav className="relative mx-auto flex h-[68px] max-w-[1160px] items-center justify-between px-6">
        <Link href="/" className="no-underline">
          <Wordmark size={19} />
        </Link>

        {/* Center nav — centrado absoluto */}
        <ul className="absolute left-1/2 top-1/2 m-0 hidden -translate-x-1/2 -translate-y-1/2 list-none items-center gap-9 p-0 md:flex">
          <li>
            <a
              href="#herramientas"
              className="font-[Lato] text-[14px] font-medium text-[#c9b4ae] no-underline transition-colors duration-200 hover:text-[#f6f2eb]"
            >
              Herramientas
            </a>
          </li>
          <li>
            <a
              href="#precios"
              className="font-[Lato] text-[14px] font-medium text-[#c9b4ae] no-underline transition-colors duration-200 hover:text-[#f6f2eb]"
            >
              Precios
            </a>
          </li>
          <li>
            <a
              href="https://jrconsulting.com.pe"
              target="_blank"
              rel="noopener noreferrer"
              className="font-[Lato] text-[14px] font-medium text-[#c9b4ae] no-underline transition-colors duration-200 hover:text-[#f6f2eb]"
            >
              Sobre JR
            </a>
          </li>
        </ul>

        {/* Right — auth CTAs (o link al dashboard si AUTH_DISABLED) */}
        <div className="flex items-center gap-3">
          {process.env.AUTH_DISABLED === "true" ? (
            <Link
              href="/dashboard"
              className="lp-pill-white px-5 py-2 text-[14px] no-underline"
            >
              Entrar al dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden font-[Lato] text-[14px] font-medium text-[#c9b4ae] no-underline transition-colors duration-200 hover:text-[#f6f2eb] sm:inline"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/signup"
                className="lp-pill-white px-5 py-2 text-[14px] no-underline"
              >
                Comenzar gratis
              </Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
