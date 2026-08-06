import Link from "next/link";

// Navbar de la landing pública (no autenticada). El área privada usa AppShell.
// ADN "JR Studio": barra transparente, logo serif con tracking amplio,
// links Poppins y CTA en pastilla blanca (como jrconsulting.com.pe).
export function Navbar() {
  return (
    <div className="sticky top-0 z-40 border-b border-[rgba(255,255,255,0.06)] bg-[#0b0b0c]/80 backdrop-blur-xl">
      <nav className="relative mx-auto flex h-[68px] max-w-[1160px] items-center justify-between px-6">
        <Link href="/" className="no-underline">
          <span className="jr-wordmark text-[20px] text-[#ededed]">
            JR <span className="text-[#d6a860]">AI HUB</span>
          </span>
        </Link>

        {/* Center nav — centrado absoluto */}
        <ul className="absolute left-1/2 top-1/2 m-0 hidden -translate-x-1/2 -translate-y-1/2 list-none items-center gap-9 p-0 md:flex">
          <li>
            <a
              href="#herramientas"
              className="font-[Poppins] text-[14px] font-medium text-[#cfcfcf] no-underline transition-colors duration-200 hover:text-[#ffffff]"
            >
              Herramientas
            </a>
          </li>
          <li>
            <a
              href="https://jrconsulting.com.pe"
              target="_blank"
              rel="noopener noreferrer"
              className="font-[Poppins] text-[14px] font-medium text-[#cfcfcf] no-underline transition-colors duration-200 hover:text-[#ffffff]"
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
                className="hidden font-[Poppins] text-[14px] font-medium text-[#cfcfcf] no-underline transition-colors duration-200 hover:text-[#ffffff] sm:inline"
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
