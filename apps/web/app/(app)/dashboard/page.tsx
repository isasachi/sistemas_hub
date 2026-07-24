import { ProjectHistory } from "@/components/dashboard/ProjectHistory";
import { Eyebrow } from "@/components/ui/Eyebrow";

// Dashboard = tablero de proyectos a pantalla completa. Los tools viven en la
// barra superior (AppShell); el cuerpo es el historial de todo lo que el usuario
// ha creado (masonry, reciente→antiguo, filtrable por tool).
export default function DashboardPage() {
  return (
    <div className="lp-root px-4 py-9 md:px-8">
      <header className="mb-8">
        <Eyebrow label="Tus proyectos" className="mb-3" />
        <h1 className="lp-serif lp-metal text-[clamp(26px,3.2vw,36px)] leading-[1.1]">
          Historial de proyectos
        </h1>
      </header>

      <ProjectHistory />
    </div>
  );
}
