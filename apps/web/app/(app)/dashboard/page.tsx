import { ShowcaseCard } from "@/components/home/ShowcaseCard";
import { ContinueStrip } from "@/components/dashboard/ContinueStrip";
import { tools, type Tool } from "@/lib/tools";

// Etapas del flujo del operador. NO es una secuencia obligatoria — cada tool
// se usa suelta; esto solo agrupa el dashboard con narrativa.
const STAGES: { id: Tool["stage"]; label: string; tagline: string }[] = [
  {
    id: "investigar",
    label: "Investigar",
    tagline: "Descubre y valida antes de invertir el primer sol.",
  },
  {
    id: "crear",
    label: "Crear",
    tagline: "Produce los activos que tu campaña necesita.",
  },
];

function StageEyebrow({ label, tagline }: { label: string; tagline: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex items-center gap-2">
        <div className="h-px w-8 bg-white/[0.12]" />
        <span className="text-[11px] font-bold uppercase tracking-[2px] text-[#8a8a8a]">
          {label}
        </span>
      </div>
      <span className="text-[13px] text-[#8a8a8a]">{tagline}</span>
    </div>
  );
}

export default function DashboardPage() {
  const live = tools.filter((t) => t.status === "live").length;

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10 md:px-10">
      {/* Cabecera del panel */}
      <header className="mb-10">
        <div className="mb-2.5 flex items-center gap-2">
          <div className="h-px w-10 bg-white/[0.12]" />
          <span className="text-[11px] font-bold uppercase tracking-[2px] text-[#8a8a8a]">
            Tu panel
          </span>
        </div>
        <h1 className="gradient-text font-[Poppins] text-[28px] font-bold">
          Tu suite de marketing con IA
        </h1>
        <p className="mt-1.5 text-[14px] text-[#bdbdbd]">
          <span className="readout font-semibold text-[#f5f5f5]">{live}</span>{" "}
          herramientas listas para usar · el resto llega pronto.
        </p>
      </header>

      {/* Retoma sesiones en curso (best-effort, $0) */}
      <ContinueStrip />

      {/* Herramientas agrupadas por etapa */}
      <div className="flex flex-col gap-12">
        {STAGES.map((stage) => {
          const stageTools = tools
            .filter((t) => t.stage === stage.id)
            // "Pronto" al final de su sección (sort estable conserva el orden del resto).
            .sort((a, b) => Number(a.status === "soon") - Number(b.status === "soon"));
          if (stageTools.length === 0) return null;
          return (
            <section key={stage.id}>
              <StageEyebrow label={stage.label} tagline={stage.tagline} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {stageTools.map((tool) => (
                  <ShowcaseCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
