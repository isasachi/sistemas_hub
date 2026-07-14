import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Tool } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";
import { ToolPreview } from "./ToolPreview";

// Pills de tag planas (sin borde): color por tinte, disciplina Apple.
const tagStyles: Record<string, string> = {
  brand: "bg-[rgba(255,156,77,0.12)] text-[#ff9c4d]",
  new: "bg-[rgba(255,156,77,0.12)] text-[#ff9c4d]",
  utility: "bg-[rgba(44,207,111,0.12)] text-[#2ccf6f]",
  neutral: "bg-white/[0.06] text-[#a1a1a6]",
};

/**
 * Card de tool para el bento del home y el grid del dashboard.
 * `wide` = card horizontal que ocupa 2 columnas (preview a la izquierda,
 * contenido a la derecha), como las cards anchas del modelo de referencia.
 */
export function ShowcaseCard({ tool, wide = false }: { tool: Tool; wide?: boolean }) {
  const Icon = toolIcon(tool.icon);
  const isSoon = tool.status === "soon";
  const pitch = tool.pitch ?? tool.description;

  const previewEl = tool.preview ? (
    <ToolPreview tool={tool} ratio="16/10" />
  ) : (
    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0d0d0e]">
      <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#6e6e73]">
        Próximamente
      </span>
    </div>
  );

  const headerAndDesc = (
    <>
      {/* Encabezado */}
      <div className="mt-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06]">
            <Icon className="h-[18px] w-[18px] text-[#a1a1a6] transition-colors duration-200 group-hover:text-[#ff9c4d]" />
          </div>
          <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-[#f5f5f7]">{tool.name}</h3>
        </div>
        <ArrowUpRight className="mt-1 h-[18px] w-[18px] shrink-0 text-[#6e6e73] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#ff9c4d]" />
      </div>

      <p className="mt-2 text-[13px] leading-[1.55] text-[#a1a1a6]">
        {wide ? tool.description : pitch}
      </p>
    </>
  );

  const statsEl = (
    <>
      {/* Stats + tag (pin al fondo → filas balanceadas pese a previews de distinta altura) */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {tool.stats?.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-baseline gap-1 rounded-full bg-white/[0.05] px-3 py-1"
          >
            <span className="readout text-[13px] font-semibold text-[#f5f5f7]">{s.value}</span>
            <span className="text-[11px] text-[#6e6e73]">{s.label}</span>
          </span>
        ))}
        <span
          className={`ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.8px] ${tagStyles[tool.tagStyle]}`}
        >
          {tool.tag}
        </span>
      </div>
    </>
  );

  const body = (
    <>
      {/* wide: el preview crece para llenar el alto de la fila */}
      <div className={wide ? "flex min-h-0 flex-1" : undefined}>{previewEl}</div>
      {headerAndDesc}
      {statsEl}
    </>
  );

  const spanClass = wide ? " sm:col-span-2 lg:col-span-2" : "";

  if (isSoon) {
    return (
      <div
        aria-disabled
        className={`group relative flex h-full flex-col overflow-hidden rounded-[24px] jr-card p-6 opacity-55 cursor-default${spanClass}`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className={[
        "group relative flex h-full flex-col overflow-hidden rounded-[24px] jr-card p-6 no-underline",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-white/[0.16]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,156,77,0.6)] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        spanClass,
      ].join(" ")}
    >
      {body}
    </Link>
  );
}
