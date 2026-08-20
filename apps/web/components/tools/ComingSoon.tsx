import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import type { Tool } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";

export function ComingSoon({ tool }: { tool: Tool }) {
  const Icon = toolIcon(tool.icon);

  return (
    <div className="min-h-[calc(100vh-56px)] md:min-h-screen flex items-center justify-center px-6 py-16 jr-grid">
      {/* Sin naranja: acá no hay ninguna acción que tomar todavía. El dorado
          marca "en camino" y deja el naranja libre para donde sí se puede hacer algo. */}
      <div className="jr-card lp-leak jr-rise w-full max-w-[460px] rounded-2xl p-8 text-center">
        <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Icon className="h-7 w-7 text-[#e8dcd6]" />
        </div>

        <span className="jr-badge-gold relative mb-4">
          <Clock className="h-3 w-3" /> Llega pronto
        </span>

        <h1 className="relative mb-2.5 text-[22px] text-[#f6f2eb]">{tool.name}</h1>
        <p className="relative mb-7 font-[Lato] text-[14px] leading-[1.6] text-[#c9b4ae]">
          {tool.longDescription}
        </p>

        <Link
          href="/dashboard"
          className="jr-btn-ghost relative rounded-full px-5 py-2.5 text-[14px] no-underline"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
