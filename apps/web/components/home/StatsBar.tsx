import { PLATFORM_STATS } from "@/lib/home/stats";

// Statement serif metálico + fila de stats con divisores verticales.
// Statement de producto, no testimonio inventado.
export function StatsBar() {
  return (
    <section className="px-8 pt-12 pb-20">
      <p className="lp-serif mx-auto max-w-[820px] text-center text-[clamp(24px,3.2vw,34px)] font-normal leading-[1.4] text-[#8a8a8a]">
        De <span className="text-[#ededed]">miles de productos analizados</span>{" "}
        salen los ganadores que{" "}
        <span className="text-[#ededed]">aún nadie pauta en Perú</span> — y los
        creativos para venderlos,{" "}
        <span className="lp-gold-word">en minutos</span>.
      </p>

      <div className="mx-auto mt-14 flex max-w-[880px] flex-col items-stretch justify-center gap-8 sm:flex-row sm:gap-0 sm:divide-x sm:divide-[rgba(255,255,255,0.08)]">
        {PLATFORM_STATS.map((stat) => (
          <div key={stat.label} className="flex-1 px-8 text-center">
            <div className="font-[Poppins] text-[36px] font-bold leading-none text-[#ffffff]">
              {stat.value}
            </div>
            <div className="lp-label mt-3 !text-[10px]">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="lp-hairline mt-16" />
    </section>
  );
}
