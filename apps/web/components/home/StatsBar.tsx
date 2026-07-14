import { PLATFORM_STATS } from "@/lib/home/stats";

// Statement grande + fila de stats con divisores verticales (patrón
// quote+stats del modelo de referencia; statement de producto, no
// testimonio inventado).
export function StatsBar() {
  return (
    <section className="px-8 pt-14 pb-24">
      <p className="mx-auto max-w-[820px] text-center text-[clamp(22px,3vw,32px)] font-semibold leading-[1.4] tracking-[-0.015em] text-[#6e6e73]">
        De <span className="text-[#f5f5f7]">miles de productos analizados</span>{" "}
        salen los ganadores que{" "}
        <span className="text-[#f5f5f7]">aún nadie pauta en Perú</span> — y los
        creativos para venderlos, <span className="accent-text">en minutos</span>.
      </p>

      <div className="mx-auto mt-16 flex max-w-[860px] flex-col items-stretch justify-center gap-8 sm:flex-row sm:gap-0 sm:divide-x sm:divide-white/[0.08]">
        {PLATFORM_STATS.map((stat) => (
          <div key={stat.label} className="flex-1 px-8 text-center">
            <div className="readout text-[38px] font-bold leading-none text-[#f5f5f7]">
              {stat.value}
            </div>
            <div className="mt-2.5 text-[13px] font-normal text-[#6e6e73]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="jr-hairline mt-20" />
    </section>
  );
}
