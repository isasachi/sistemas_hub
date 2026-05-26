import Link from "next/link";
import { ArrowUpRight, Activity, Video, Sparkles, DollarSign, LayoutTemplate, ImagePlus } from "lucide-react";
import type { Tool } from "@/lib/tools";

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Activity,
  Video,
  Sparkles,
  DollarSign,
  LayoutTemplate,
  ImagePlus,
};

const tagStyles: Record<string, string> = {
  brand:
    "bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.22)] text-[#f59e0b]",
  new: "bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#f87171]",
  utility:
    "bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.2)] text-[#34d399]",
  neutral:
    "bg-[rgba(148,163,184,0.1)] border border-[rgba(148,163,184,0.15)] text-[#94a3b8]",
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
        "group relative block rounded-2xl border border-white/[0.08] p-6 no-underline overflow-hidden",
        "transition-all duration-200",
        "hover:border-[rgba(245,158,11,0.28)] hover:bg-white/[0.07] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(245,158,11,0.08)]",
        tool.featured
          ? "bg-[linear-gradient(135deg,rgba(245,158,11,0.07)_0%,rgba(239,68,68,0.04)_100%)] border-[rgba(245,158,11,0.18)] col-span-2"
          : "bg-white/[0.04]",
      ].join(" ")}
    >
      {/* Shimmer top border on hover */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(245,158,11,0.5), transparent)",
        }}
      />

      {/* Card top row */}
      <div className="flex items-start justify-between mb-3.5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${tool.accentColor}1a` }}
        >
          <Icon
            className="w-[22px] h-[22px]"
            style={{ color: tool.accentColor }}
          />
        </div>
        <ArrowUpRight className="w-[18px] h-[18px] text-[#475569] group-hover:text-[#f59e0b] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
      </div>

      <h3 className="text-[16px] font-bold text-[#f1f5f9] mb-1.5 tracking-[-0.2px]">
        {tool.name}
      </h3>
      <p className="text-[13px] text-[#94a3b8] leading-[1.55] mb-4">
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
