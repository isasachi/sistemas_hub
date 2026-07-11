import { PLATFORM_STATS } from "@/lib/home/stats";

export function StatsBar() {
  return (
    <div className="px-8 pb-14">
      <div className="flex items-center justify-center gap-4 flex-wrap">
        {PLATFORM_STATS.map((stat) => (
          <div
            key={stat.label}
            className="jr-card rounded-2xl px-8 py-5 text-center min-w-[180px] max-w-[260px]"
          >
            <div className="text-[28px] font-bold gradient-text leading-none font-[Poppins]">
              {stat.value}
            </div>
            <div className="text-[13px] text-[#8a8a8a] font-medium mt-1.5">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      <div className="jr-hairline mt-14" />
    </div>
  );
}
