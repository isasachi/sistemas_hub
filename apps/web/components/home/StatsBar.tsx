import { PLATFORM_STATS } from "@/lib/home/stats";

// Statement grande en serif de display + fila de stats con divisores
// verticales (statement de producto, no testimonio inventado).
export function StatsBar() {
  return (
    <section className="px-8 pt-12 pb-20">
      <p className="font-display mx-auto max-w-[780px] text-center text-[clamp(22px,3vw,32px)] font-normal leading-[1.4] text-[#726b60]">
        De <span className="text-[#f3efe8]">miles de productos analizados</span>{" "}
        salen los ganadores que{" "}
        <span className="text-[#f3efe8]">aún nadie pauta en Perú</span> — y los
        creativos para venderlos,{" "}
        <span className="italic text-[#ff9c4d]">en minutos</span>.
      </p>

      <div className="mx-auto mt-14 flex max-w-[860px] flex-col items-stretch justify-center gap-8 sm:flex-row sm:gap-0 sm:divide-x sm:divide-[rgba(255,240,220,0.08)]">
        {PLATFORM_STATS.map((stat) => (
          <div key={stat.label} className="flex-1 px-8 text-center">
            <div className="readout text-[34px] font-bold leading-none text-[#f3efe8]">
              {stat.value}
            </div>
            <div className="spec-label mt-2.5 !text-[10px]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="jr-hairline mt-16" />
    </section>
  );
}
