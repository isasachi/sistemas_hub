const stats = [
  { value: "5", label: "Herramientas de IA" },
  { value: "10×", label: "Más rápido que manual" },
  { value: "100%", label: "En español" },
];

export function StatsBar() {
  return (
    <div className="flex items-center justify-center gap-12 px-8 pb-14 border-b border-white/[0.08] flex-wrap">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <div className="text-[28px] font-extrabold gradient-text leading-none">
            {stat.value}
          </div>
          <div className="text-[13px] text-[#475569] font-medium mt-1">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}
