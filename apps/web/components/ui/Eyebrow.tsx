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
      <span aria-hidden className="text-[11px] leading-none text-[#e8dcd6] opacity-70">
        ✦
      </span>
      <span className="font-[Archivo] text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e8dcd6]">
        {label}
      </span>
      <span aria-hidden className="text-[11px] leading-none text-[#e8dcd6] opacity-70">
        ✦
      </span>
    </div>
  );
}
