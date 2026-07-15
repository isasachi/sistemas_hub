import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Tool } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";
import { ToolPreview } from "./ToolPreview";

// Pills de tag planas con tinte (chips del sistema de referencia).
const tagStyles: Record<string, string> = {
  brand: "bg-[rgba(255,156,77,0.12)] text-[#ff9c4d]",
  new: "bg-[rgba(255,156,77,0.12)] text-[#ff9c4d]",
  utility: "bg-[rgba(76,208,125,0.12)] text-[#4cd07d]",
  neutral: "bg-[rgba(255,240,220,0.06)] text-[#a8a094]",
};

/**
 * Card de tool para el bento del home y el grid del dashboard — card
 * anidada del sistema: gutter estrecho alrededor del preview (panel
 * inset) y bloque de contenido con más aire debajo.
 * `wide` = card horizontal que ocupa 2 columnas.
 */
export function ShowcaseCard({ tool, wide = false }: { tool: Tool; wide?: boolean }) {
  const Icon = toolIcon(tool.icon);
  const isSoon = tool.status === "soon";
  const pitch = tool.pitch ?? tool.description;

  const previewEl = tool.preview ? (
    <ToolPreview tool={tool} ratio="16/10" />
  ) : (
    <div className="jr-inset flex aspect-[4/3] w-full flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between px-3.5 pt-3">
        <span className="spec-label">En diseño</span>
        <span className="spec-label">2026</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <span className="spec-label !text-[10px]">Próximamente</span>
      </div>
    </div>
  );

  const headerAndDesc = (
    <>
      {/* Encabezado */}
      <div className="mt-4 flex items-start justify-between gap-3 px-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(255,240,220,0.08)] bg-[rgba(255,240,220,0.04)]">
            <Icon className="h-[17px] w-[17px] text-[#a8a094] transition-colors duration-200 group-hover:text-[#ff9c4d]" />
          </div>
          <h3 className="text-[16px] font-semibold text-[#f3efe8]">{tool.name}</h3>
        </div>
        <ArrowUpRight className="mt-1 h-[18px] w-[18px] shrink-0 text-[#726b60] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#ff9c4d]" />
      </div>

      <p className="mt-2 px-2 text-[13px] leading-[1.55] text-[#a8a094]">
        {wide ? tool.description : pitch}
      </p>
    </>
  );

  const statsEl = (
    <>
      {/* Stats + tag (pin al fondo → filas balanceadas pese a previews de distinta altura) */}
      <div className="mt-auto flex flex-wrap items-center gap-2 px-2 pb-1 pt-4">
        {tool.stats?.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-baseline gap-1 rounded-full border border-[rgba(255,240,220,0.07)] bg-[rgba(255,240,220,0.03)] px-2.5 py-1"
          >
            <span className="readout text-[12px] font-bold text-[#f3efe8]">{s.value}</span>
            <span className="text-[11px] text-[#726b60]">{s.label}</span>
          </span>
        ))}
        <span
          className={`ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] ${tagStyles[tool.tagStyle]}`}
        >
          {tool.tag}
        </span>
      </div>
    </>
  );

  const body = (
    <>
      {/* El preview siempre crece para llenar el alto de la fila: las cards
          de una misma fila quedan con previews de igual altura (el aspect
          16/10 actúa como mínimo). */}
      <div className="flex min-h-0 flex-1">{previewEl}</div>
      {headerAndDesc}
      {statsEl}
    </>
  );

  const spanClass = wide ? " sm:col-span-2 lg:col-span-2" : "";

  if (isSoon) {
    return (
      <div
        aria-disabled
        className={`group relative flex h-full flex-col overflow-hidden rounded-[22px] jr-card p-2.5 pb-3 opacity-55 cursor-default${spanClass}`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className={[
        "group relative flex h-full flex-col overflow-hidden rounded-[22px] jr-card p-2.5 pb-3 no-underline",
        "transition-all duration-200",
        "hover:-translate-y-1 hover:border-[rgba(255,240,220,0.14)] hover:shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,156,77,0.6)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141210]",
        spanClass,
      ].join(" ")}
    >
      {body}
    </Link>
  );
}
