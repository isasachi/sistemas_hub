// Eyebrow de sección "✦ LABEL ✦": marcas decorativas flanqueando el label
// en Poppins uppercase dorado (ADN "JR Studio").
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
      <span aria-hidden className="text-[11px] leading-none text-[#d6a860] opacity-70">
        ✦
      </span>
      <span className="font-[Poppins] text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d6a860]">
        {label}
      </span>
      <span aria-hidden className="text-[11px] leading-none text-[#d6a860] opacity-70">
        ✦
      </span>
    </div>
  );
}
