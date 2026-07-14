// Eyebrow de sección "✦ LABEL" (lenguaje del rediseño 2026-07: reemplaza el
// patrón hairline+label en home y dashboard).
export function Eyebrow({
  label,
  center = false,
  className = "",
}: {
  label: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 ${center ? "justify-center" : ""} ${className}`}
    >
      <span aria-hidden className="text-[13px] leading-none text-[#ff9c4d]">
        ✦
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[2px] text-[#ff9c4d]">
        {label}
      </span>
    </div>
  );
}
