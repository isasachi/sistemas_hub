import { Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Tip {
  text: React.ReactNode;
  variant?: "default" | "success";
}

interface PreviewPanelProps {
  icon: LucideIcon;
  accentColor: string;
  placeholderTitle: string;
  placeholderSub: string;
  tips?: Tip[];
  children?: React.ReactNode; // output content when ready
  isReady?: boolean;
}

export function PreviewPanel({
  icon: Icon,
  accentColor,
  placeholderTitle,
  placeholderSub,
  tips = [],
  children,
  isReady = false,
}: PreviewPanelProps) {
  return (
    <div className="bg-[#0d0d18] px-9 py-10 flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-[11px] font-bold text-[#475569] tracking-[1.5px] uppercase">
          Vista previa
        </span>
        <span className="text-[10px] font-bold bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] text-[#f59e0b] px-2.5 py-0.5 rounded-full tracking-[0.5px] uppercase">
          En vivo
        </span>
      </div>

      {/* Content area */}
      {isReady && children ? (
        <div className="flex-1">{children}</div>
      ) : (
        <div className="flex-1 bg-white/[0.04] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-10 min-h-[300px]">
          <div
            className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center mb-4"
            style={{ background: `${accentColor}1a`, border: `1px solid ${accentColor}2e` }}
          >
            <Icon className="w-6 h-6" style={{ color: accentColor }} />
          </div>
          <p className="text-[15px] font-bold text-[#f1f5f9] mb-2">
            {placeholderTitle}
          </p>
          <p className="text-[13px] text-[#475569] leading-[1.5] max-w-[240px]">
            {placeholderSub}
          </p>
        </div>
      )}

      {/* Tips */}
      {tips.length > 0 && (
        <div className="mt-5 flex flex-col gap-2.5">
          {tips.map((tip, i) => (
            <div
              key={i}
              className={[
                "flex gap-2.5 items-start rounded-xl p-3.5 border text-[12px] leading-[1.55]",
                tip.variant === "success"
                  ? "bg-[rgba(59,130,246,0.05)] border-[rgba(59,130,246,0.15)] text-[#94a3b8]"
                  : "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.14)] text-[#94a3b8]",
              ].join(" ")}
            >
              <Info
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{
                  color: tip.variant === "success" ? "#60a5fa" : "#f59e0b",
                }}
              />
              <span>{tip.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
