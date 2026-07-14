import { PLATFORM_STATS } from "@/lib/home/stats";

// Statement grande + fila de stats con divisores verticales (patrón
// quote+stats del modelo de referencia; statement de producto, no
// testimonio inventado).
export function StatsBar() {
  return (
    <section className="px-8 pt-8 pb-16">
      <p className="mx-auto max-w-[760px] text-center text-[clamp(20px,2.8vw,28px)] font-semibold leading-[1.45] text-[#8a8a8a]">
        De <span className="text-[#f5f5f5]">miles de productos analizados</span>{" "}
        salen los ganadores que{" "}
        <span className="text-[#f5f5f5]">aún nadie pauta en Perú</span> — y los
        creativos para venderlos, <span className="accent-text">en minutos</span>.
      </p>

      <div className="mx-auto mt-12 flex max-w-[860px] flex-col items-stretch justify-center gap-8 sm:flex-row sm:gap-0 sm:divide-x sm:divide-white/[0.08]">
        {PLATFORM_STATS.map((stat) => (
          <div key={stat.label} className="flex-1 px-8 text-center">
            <div className="readout text-[34px] font-bold leading-none text-[#f5f5f5]">
              {stat.value}
            </div>
            <div className="mt-2 text-[13px] font-medium text-[#8a8a8a]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="jr-hairline mt-16" />
    </section>
  );
}
