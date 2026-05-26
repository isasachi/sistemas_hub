"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, ChevronLeft } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const isToolPage = pathname.startsWith("/tools/");

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between px-8 h-[60px] border-b border-white/[0.08] bg-[#080810]/90 backdrop-blur-[16px]">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 no-underline group">
        <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center bg-brand-gradient shadow-[0_0_16px_rgba(245,158,11,0.3)]">
          <Zap className="w-[18px] h-[18px] text-white fill-white" />
        </div>
        <span className="text-[15px] font-bold text-[#f1f5f9] tracking-[0.2px]">
          JR <span className="text-[#f59e0b]">AI Hub</span>
        </span>
      </Link>

      {/* Center nav — only on home */}
      {!isToolPage && (
        <ul className="hidden md:flex items-center gap-1 list-none m-0 p-0">
          <li>
            <Link
              href="/"
              className="text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/[0.04] text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-200 no-underline"
            >
              Herramientas
            </Link>
          </li>
          <li>
            <Link
              href="/#como-funciona"
              className="text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/[0.04] text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-200 no-underline"
            >
              Cómo funciona
            </Link>
          </li>
          <li>
            <a
              href="https://jrconsulting.com.pe"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/[0.04] text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-200 no-underline"
            >
              Sobre JR
            </a>
          </li>
        </ul>
      )}

      {/* Right side */}
      {isToolPage ? (
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#f1f5f9] text-sm font-medium transition-colors duration-200 no-underline"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a herramientas
        </Link>
      ) : (
        <button className="bg-brand-gradient text-white text-sm font-bold px-5 py-2 rounded-lg shadow-[0_4px_16px_rgba(245,158,11,0.25)] hover:opacity-90 hover:shadow-[0_4px_24px_rgba(245,158,11,0.4)] transition-all duration-200 cursor-pointer border-0">
          Comenzar gratis
        </button>
      )}
    </nav>
  );
}
