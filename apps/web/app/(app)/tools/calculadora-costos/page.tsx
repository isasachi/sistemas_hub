"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SessionHistory from "@/components/tools/ui/SessionHistory";

export default function CalculadoraCostos() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-8 py-3.5 border-b border-white/[0.06] flex items-center gap-2 text-[13px]">
        <Link href="/dashboard" className="text-[#8a8a8a] hover:text-[#bdbdbd] no-underline">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5 text-[#8a8a8a]" />
        <span className="text-[#f5f5f5] font-semibold">Calculadora de Costos</span>
      </div>
      <SessionHistory slug="calculadora-costos" />
    </div>
  );
}
