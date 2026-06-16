import Link from "next/link";
import { ArrowUpRight, Activity, Video, Sparkles, DollarSign, LayoutTemplate, ImagePlus, PackageSearch } from "lucide-react";
import type { Tool } from "@/lib/tools";

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Activity,
  Video,
  Sparkles,
  DollarSign,
  LayoutTemplate,
  ImagePlus,
  PackageSearch,
};

const tagStyles: Record<string, string> = {
  brand:
    "bg-[rgba(255,156,77,0.10)] border border-[rgba(255,156,77,0.25)] text-[#ff9c4d]",
  new: "bg-[rgba(255,156,77,0.10)] border border-[rgba(255,156,77,0.25)] text-[#ff9c4d]",
  utility:
    "bg-[rgba(44,207,111,0.08)] border border-[rgba(44,207,111,0.25)] text-[#2ccf6f]",
  neutral:
    "bg-white/[0.04] border border-white/[0.12] text-[#bdbdbd]",
};

interface ToolCardProps {
  tool: Tool;
}

export function ToolCard({ tool }: ToolCardProps) {
  const Icon = iconMap[tool.icon] ?? Activity;

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className={[
        "group relative block rounded-2xl jr-card p-6 no-underline overflow-hidden",
        "transition-all duration-200",
        "hover:border-[rgba(255,156,77,0.28)] hover:bg-white/[0.04] hover:-translate-y-0.5 hover:shadow-[0_10px_35px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)]",
      ].join(" ")}
    >
      {/* Hairline superior que se enciende al hover */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,160,80,0) 0%, #FF9C4D 18%, #FF7A2F 50%, #FF9C4D 82%, rgba(255,160,80,0) 100%)",
        }}
      />

      {/* Card top row */}
      <div className="flex items-start justify-between mb-3.5">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/[0.04] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Icon className="w-[22px] h-[22px] text-[#cfcfcf] group-hover:text-[#ff9c4d] transition-colors duration-200" />
        </div>
        <ArrowUpRight className="w-[18px] h-[18px] text-[#8a8a8a] group-hover:text-[#ff9c4d] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
      </div>

      <h3 className="text-[16px] font-bold text-[#f5f5f5] mb-1.5">
        {tool.name}
      </h3>
      <p className="text-[13px] text-[#bdbdbd] leading-[1.55] mb-4">
        {tool.description}
      </p>

      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-[0.8px] uppercase ${tagStyles[tool.tagStyle]}`}
      >
        {tool.tag}
      </span>
    </Link>
  );
}
