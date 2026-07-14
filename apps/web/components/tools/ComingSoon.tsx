import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import type { Tool } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";

export function ComingSoon({ tool }: { tool: Tool }) {
  const Icon = toolIcon(tool.icon);

  return (
    <div className="min-h-[calc(100vh-56px)] md:min-h-screen flex items-center justify-center px-6 py-16 jr-grid">
      <div className="jr-card rounded-2xl max-w-[460px] w-full p-8 text-center relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,160,80,0) 0%, #FF9C4D 50%, rgba(255,160,80,0) 100%)",
          }}
        />

        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Icon className="w-7 h-7 text-[#ff9c4d]" />
        </div>

        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#ffb877] bg-[rgba(255,156,77,0.1)] border border-[rgba(255,156,77,0.25)] rounded-full px-3 py-1 mb-4 tracking-[0.5px] uppercase">
          <Clock className="w-3 h-3" /> Llega pronto
        </span>

        <h1 className="text-[22px] font-bold gradient-text mb-2.5">{tool.name}</h1>
        <p className="text-[14px] text-[#bdbdbd] leading-[1.6] mb-7">{tool.longDescription}</p>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#bdbdbd] border border-white/[0.12] hover:text-[#f5f5f5] hover:border-white/[0.25] hover:bg-white/[0.04] rounded-full px-5 py-2.5 no-underline transition-all duration-200"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
