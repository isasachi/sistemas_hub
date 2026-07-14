import Link from "next/link";

// Navbar de la landing pública (no autenticada). El área privada usa AppShell.
// Píldora flotante del sistema de referencia: barra redondeada despegada del
// borde, con superficie elevada y sombra difusa.
export function Navbar() {
  return (
    <div className="sticky top-0 z-40 px-4 pt-4">
      <nav className="jr-card relative mx-auto flex h-[52px] max-w-[960px] items-center justify-between rounded-full bg-[#1c1917]/90 px-5 backdrop-blur-xl">
        {/* Logo tipográfico */}
        <Link href="/" className="no-underline">
          <span className="font-display text-[16px] font-medium text-[#f3efe8]">
            JR <span className="text-[#ff9c4d]">AI Hub</span>
          </span>
        </Link>

        {/* Center nav — centrado absoluto, independiente del ancho de logo/CTAs */}
        <ul className="hidden md:flex items-center gap-7 list-none m-0 p-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <li>
            <a
              href="#herramientas"
              className="text-[13px] font-medium text-[#a8a094] hover:text-[#f3efe8] transition-colors duration-200 no-underline"
            >
              Herramientas
            </a>
          </li>
          <li>
            <a
              href="https://jrconsulting.com.pe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium text-[#a8a094] hover:text-[#f3efe8] transition-colors duration-200 no-underline"
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
              className="jr-cta text-[13px] font-bold px-4 py-1.5 rounded-full no-underline"
            >
              Entrar al dashboard →
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-[13px] font-medium text-[#a8a094] hover:text-[#f3efe8] px-3 py-1.5 transition-colors duration-200 no-underline"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/signup"
                className="jr-cta text-[13px] font-bold px-4 py-1.5 rounded-full no-underline"
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
