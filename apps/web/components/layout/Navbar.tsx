import Link from "next/link";

// Navbar de la landing pública (no autenticada). El área privada usa AppShell.
// Barra frosted-glass estilo Apple: compacta, translúcida, hairline inferior.
export function Navbar() {
  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-8 h-12 border-b border-white/[0.08] bg-[#161617]/80 backdrop-blur-xl backdrop-saturate-[180%]">
      {/* Logo tipográfico */}
      <Link href="/" className="no-underline">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#f5f5f7]">
          JR <span className="text-[#ff9c4d]">AI Hub</span>
        </span>
      </Link>

      {/* Center nav — centrado absoluto, independiente del ancho de logo/CTAs */}
      <ul className="hidden md:flex items-center gap-7 list-none m-0 p-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <li>
          <a
            href="#herramientas"
            className="text-[13px] font-normal text-[#a1a1a6] hover:text-[#f5f5f7] transition-colors duration-200 no-underline"
          >
            Herramientas
          </a>
        </li>
        <li>
          <a
            href="https://jrconsulting.com.pe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-normal text-[#a1a1a6] hover:text-[#f5f5f7] transition-colors duration-200 no-underline"
          >
            Sobre JR
          </a>
        </li>
      </ul>

      {/* Right side: auth CTAs (o link temporal al dashboard si AUTH_DISABLED) */}
      <div className="flex items-center gap-2">
        {process.env.AUTH_DISABLED === "true" ? (
          <Link
            href="/dashboard"
            className="jr-cta text-[13px] font-semibold px-4 py-1.5 rounded-full no-underline"
          >
            Entrar al dashboard →
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="text-[13px] font-normal text-[#a1a1a6] hover:text-[#f5f5f7] px-3 py-1.5 transition-colors duration-200 no-underline"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/signup"
              className="jr-cta text-[13px] font-semibold px-4 py-1.5 rounded-full no-underline"
            >
              Comenzar gratis
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
