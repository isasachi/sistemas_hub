import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Tool } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";
import { ToolPreview } from "./ToolPreview";

/**
 * Card de tool del ADN "JR Studio" (landing + dashboard): superficie
 * casi-negra, fuga de luz dorada al borde superior (firma), chip de icono
 * naranja, título Poppins y body Lato. Requiere un ancestro `.lp-root`.
 * `wide` = card horizontal (2 columnas). Soporta tools `soon` (no clicable).
 */
export function LandingToolCard({ tool, wide = false }: { tool: Tool; wide?: boolean }) {
  const Icon = toolIcon(tool.icon);
  const isSoon = tool.status === "soon";
  const pitch = tool.pitch ?? tool.description;
  const spanClass = wide ? " sm:col-span-2 lg:col-span-2" : "";

  const previewEl = tool.preview ? (
    <ToolPreview tool={tool} ratio="16/10" />
  ) : (
    <div className="jr-inset flex aspect-[16/10] w-full flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between px-3.5 pt-3">
        <span className="lp-label !text-[10px]">En diseño</span>
        <span className="lp-label !text-[10px]">2026</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <span className="lp-label !text-[10px]">Próximamente</span>
      </div>
    </div>
  );

  const body = (
    <>
      {/* Preview real (crece para igualar alturas de fila) */}
      <div className="relative z-[1] flex min-h-0 flex-1">{previewEl}</div>

      {/* Encabezado: chip naranja + nombre + flecha */}
      <div className="relative z-[1] mt-4 flex items-start justify-between gap-3 px-2">
        <div className="flex items-center gap-2.5">
          <span className="lp-icon-chip h-9 w-9 shrink-0">
            <Icon className="h-[17px] w-[17px]" />
          </span>
          <h3 className="text-[17px] font-semibold text-[#efe7e0]">{tool.name}</h3>
        </div>
        {!isSoon && (
          <ArrowUpRight className="mt-1 h-[18px] w-[18px] shrink-0 text-[#c9b4ae] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[rgb(232,70,122)]" />
        )}
      </div>

      <p className="relative z-[1] mt-2 px-2 font-[Archivo] text-[13px] leading-[1.55] text-[#a98c88]">
        {wide ? tool.description : pitch}
      </p>

      {/* Stats + tag al fondo (chips hairline neutros) */}
      <div className="relative z-[1] mt-auto flex flex-wrap items-center gap-2 px-2 pb-1 pt-4">
        {tool.stats?.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-baseline gap-1 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1"
          >
            <span className="text-[12px] font-semibold text-[#efe7e0]">{s.value}</span>
            <span className="font-[Archivo] text-[11px] text-[#c9b4ae]">{s.label}</span>
          </span>
        ))}
        <span className="lp-label ml-auto rounded-full border border-[rgba(246,242,235,0.35)] bg-[rgba(246,242,235,0.08)] px-2.5 py-1 !text-[10px] !text-[#e8dcd6]">
          {tool.tag}
        </span>
      </div>
    </>
  );

  if (isSoon) {
    return (
      <div
        aria-disabled
        className={`lp-card lp-leak group relative flex h-full cursor-default flex-col overflow-hidden p-2.5 pb-4 opacity-55${spanClass}`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className={[
        "lp-card lp-leak group relative flex h-full flex-col overflow-hidden p-2.5 pb-4 no-underline",
        "transition-transform duration-200 ease-[cubic-bezier(0.29,0.63,0.44,1)]",
        "hover:-translate-y-1 hover:border-[rgba(255,255,255,0.2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,255,255,0.25)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#14050a]",
        spanClass,
      ].join(" ")}
    >
      {body}
    </Link>
  );
}
