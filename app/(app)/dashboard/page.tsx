import { ToolCard } from "@/components/home/ToolCard";
import { tools } from "@/lib/tools";

export default function DashboardPage() {
  const live = tools.filter((t) => t.status === "live").length;

  return (
    <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="h-px w-10 bg-white/[0.12]" />
          <span className="text-[11px] font-bold text-[#8a8a8a] tracking-[2px] uppercase">
            Tu dashboard
          </span>
        </div>
        <h1 className="text-[26px] font-bold gradient-text font-[Poppins]">
          Tus herramientas de marketing con IA
        </h1>
        <p className="text-[14px] text-[#bdbdbd] mt-1.5">
          {live} disponibles ahora · el resto llega pronto.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {tools.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} />
        ))}
      </div>
    </div>
  );
}
