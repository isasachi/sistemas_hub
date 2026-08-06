import { ProjectHistory } from "@/components/dashboard/ProjectHistory";

// Dashboard = tablero de proyectos a pantalla completa. Los tools viven en la
// barra superior (AppShell); el cuerpo es el historial de todo lo que el usuario
// ha creado (masonry, reciente→antiguo, filtrable por tool).
export default function DashboardPage() {
  return (
    <div className="lp-root px-4 py-9 md:px-8">
      {/* Un solo titular. Antes había eyebrow + h1 ("Tus proyectos" arriba de
          "Historial de proyectos") diciendo dos veces lo mismo. */}
      <header className="mb-8">
        <h1 className="lp-metal text-[clamp(24px,3.2vw,34px)] font-semibold uppercase leading-[1.1] tracking-[0.16em]">
          Tus proyectos
        </h1>
      </header>

      <ProjectHistory />
    </div>
  );
}
