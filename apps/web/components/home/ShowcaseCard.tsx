import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Tool } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";
import { ToolPreview } from "./ToolPreview";

const tagStyles: Record<string, string> = {
  brand: "bg-[rgba(255,156,77,0.10)] border border-[rgba(255,156,77,0.25)] text-[#ff9c4d]",
  new: "bg-[rgba(255,156,77,0.10)] border border-[rgba(255,156,77,0.25)] text-[#ff9c4d]",
  utility: "bg-[rgba(44,207,111,0.08)] border border-[rgba(44,207,111,0.25)] text-[#2ccf6f]",
  neutral: "bg-white/[0.04] border border-white/[0.12] text-[#bdbdbd]",
};

export function ShowcaseCard({ tool }: { tool: Tool }) {
  const Icon = toolIcon(tool.icon);
  const isSoon = tool.status === "soon";
  const pitch = tool.pitch ?? tool.description;

  const body = (
    <>
      {/* Hairline superior que se enciende al hover */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,160,80,0) 0%, #FF9C4D 18%, #FF7A2F 50%, #FF9C4D 82%, rgba(255,160,80,0) 100%)",
        }}
      />

      {/* Sneak peek — frame uniforme y compacto para el grid */}
      {tool.preview ? (
        <ToolPreview tool={tool} ratio="16/10" />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-white/[0.08] bg-[#0d0d0d]">
          <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#8a8a8a]">
            Próximamente
          </span>
        </div>
      )}

      {/* Encabezado */}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <Icon className="h-[18px] w-[18px] text-[#cfcfcf] transition-colors duration-200 group-hover:text-[#ff9c4d]" />
          </div>
          <h3 className="text-[16px] font-bold text-[#f5f5f5]">{tool.name}</h3>
        </div>
        <ArrowUpRight className="mt-1 h-[18px] w-[18px] shrink-0 text-[#8a8a8a] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#ff9c4d]" />
      </div>

      <p className="mt-2 text-[13px] leading-[1.55] text-[#bdbdbd]">{pitch}</p>

      {/* Stats + tag (pin al fondo → filas balanceadas pese a previews de distinta altura) */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {tool.stats?.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-baseline gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1"
          >
            <span className="text-[13px] font-bold text-[#f5f5f5]">{s.value}</span>
            <span className="text-[11px] text-[#8a8a8a]">{s.label}</span>
          </span>
        ))}
        <span
          className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.8px] ${tagStyles[tool.tagStyle]}`}
        >
          {tool.tag}
        </span>
      </div>
    </>
  );

  if (isSoon) {
    return (
      <div
        aria-disabled
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl jr-card p-5 opacity-55 cursor-default"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className={[
        "group relative flex h-full flex-col overflow-hidden rounded-2xl jr-card p-5 no-underline",
        "transition-all duration-200",
        "hover:border-[rgba(255,156,77,0.28)] hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,156,77,0.6)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
      ].join(" ")}
    >
      {body}
    </Link>
  );
}
