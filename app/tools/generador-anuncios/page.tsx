"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import AdWizard from "@/components/tools/generador-anuncios/AdWizard";

export default function GeneradorAnuncios() {
  return (
    <div className="min-h-screen flex flex-col bg-[#080810]">
      {/* Breadcrumb */}
      <div className="px-8 py-3.5 border-b border-white/[0.08] flex items-center gap-2 text-[13px]">
        <Link href="/" className="text-[#475569] hover:text-[#94a3b8] transition-colors no-underline">
          Herramientas
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-[#475569]" />
        <span className="text-[#f1f5f9] font-semibold">Generador de Anuncios</span>
      </div>
      <AdWizard />
    </div>
  );
}
