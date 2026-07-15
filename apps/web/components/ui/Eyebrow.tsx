// Eyebrow de sección "✦ LABEL ✦": marcas decorativas flanqueando el label
// en mono uppercase (lenguaje spec del sistema de referencia).
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
      className={`flex items-center gap-2 ${center ? "justify-center" : ""} ${className}`}
    >
      <span aria-hidden className="text-[11px] leading-none text-[#ff9c4d] opacity-70">
        ✦
      </span>
      <span className="readout text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ff9c4d]">
        {label}
      </span>
      <span aria-hidden className="text-[11px] leading-none text-[#ff9c4d] opacity-70">
        ✦
      </span>
    </div>
  );
}
