"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, ChevronLeft } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const isToolPage = pathname.startsWith("/tools/");

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between px-8 h-[60px] border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-[16px]">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 no-underline group">
        <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center jr-cta !shadow-[0_4px_14px_rgba(255,142,60,0.3),inset_0_1px_0_rgba(255,255,255,0.65)]">
          <Zap className="w-[18px] h-[18px] text-[#1c0f03] fill-[#1c0f03]" />
        </div>
        <span className="text-[15px] font-bold text-[#f5f5f5] tracking-[0.2px] font-[Poppins]">
          JR <span className="text-[#ff9c4d]">AI Hub</span>
        </span>
      </Link>

      {/* Center nav — only on home */}
      {!isToolPage && (
        <ul className="hidden md:flex items-center gap-1 list-none m-0 p-0">
          <li>
            <Link
              href="/"
              className="text-[#bdbdbd] hover:text-[#f5f5f5] hover:bg-white/[0.04] text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-200 no-underline"
            >
              Herramientas
            </Link>
          </li>
          <li>
            <Link
              href="/#como-funciona"
              className="text-[#bdbdbd] hover:text-[#f5f5f5] hover:bg-white/[0.04] text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-200 no-underline"
            >
              Cómo funciona
            </Link>
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
      )}

      {/* Right side */}
      {isToolPage ? (
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[#bdbdbd] hover:text-[#f5f5f5] text-sm font-medium transition-colors duration-200 no-underline"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a herramientas
        </Link>
      ) : (
        <button className="jr-cta text-sm font-bold px-5 py-2 rounded-full cursor-pointer border-0">
          Comenzar gratis
        </button>
      )}
    </nav>
  );
}
