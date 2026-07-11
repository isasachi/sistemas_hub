import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { StatsBar } from "@/components/home/StatsBar";
import { ShowcaseCard } from "@/components/home/ShowcaseCard";
import { tools } from "@/lib/tools";

export default function Home() {
  // Solo tools en producción — sin cards "Próximamente" en la landing de ventas.
  const liveTools = tools.filter((t) => t.status === "live");

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <StatsBar />

        {/* Showcase de herramientas — sneak peek + stats por tool */}
        <section id="herramientas" className="max-w-[1100px] mx-auto px-8 py-14">
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-2.5">
              <div className="h-px w-10 bg-white/[0.12]" />
              <span className="text-[11px] font-bold text-[#8a8a8a] tracking-[2px] uppercase">
                Las {liveTools.length} herramientas
              </span>
              <div className="h-px w-10 bg-white/[0.12]" />
            </div>
            <h2 className="text-[28px] font-bold gradient-text">
              Mira exactamente qué recibes
            </h2>
            <p className="mt-2 text-[15px] text-[#bdbdbd] max-w-[460px] mx-auto">
              Cada herramienta, con un ejemplo real de lo que genera. Sin humo.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {liveTools.map((tool) => (
              <ShowcaseCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
