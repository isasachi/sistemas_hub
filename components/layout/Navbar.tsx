import Link from "next/link";
import { Zap } from "lucide-react";

// Navbar de la landing pública (no autenticada). El área privada usa AppShell.
export function Navbar() {
  return (
    <nav className="sticky top-0 z-40 relative flex items-center justify-between px-6 md:px-8 h-[60px] border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-[16px]">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 no-underline group">
        <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center jr-cta">
          <Zap className="w-[18px] h-[18px] text-[#1c0f03] fill-[#1c0f03]" />
        </div>
        <span className="text-[15px] font-bold text-[#f5f5f5] tracking-[0.2px] font-[Poppins]">
          JR <span className="text-[#ff9c4d]">AI Hub</span>
        </span>
      </Link>

      {/* Center nav — centrado absoluto, independiente del ancho de logo/CTAs */}
      <ul className="hidden md:flex items-center gap-1 list-none m-0 p-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <li>
          <a
            href="#herramientas"
            className="text-[#bdbdbd] hover:text-[#f5f5f5] hover:bg-white/[0.04] text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-200 no-underline"
          >
            Herramientas
          </a>
        </li>
        <li>
          <a
            href="https://jrconsulting.com.pe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#bdbdbd] hover:text-[#f5f5f5] hover:bg-white/[0.04] text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-200 no-underline"
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
            className="jr-cta text-sm font-bold px-5 py-2 rounded-full no-underline"
          >
            Entrar al dashboard →
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="text-[#bdbdbd] hover:text-[#f5f5f5] text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/[0.04] transition-all duration-200 no-underline"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/signup"
              className="jr-cta text-sm font-bold px-5 py-2 rounded-full no-underline"
            >
              Comenzar gratis
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
