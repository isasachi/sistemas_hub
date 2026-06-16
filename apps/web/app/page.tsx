import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { StatsBar } from "@/components/home/StatsBar";
import { ToolCard } from "@/components/home/ToolCard";
import { tools } from "@/lib/tools";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <StatsBar />

        {/* Tools grid */}
        <section id="herramientas" className="max-w-[1100px] mx-auto px-8 py-14">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-px w-10 bg-white/[0.12]" />
              <span className="text-[11px] font-bold text-[#8a8a8a] tracking-[2px] uppercase">
                Las 6 herramientas
              </span>
              <div className="h-px w-10 bg-white/[0.12]" />
            </div>
            <h2 className="text-2xl font-bold gradient-text">
              Todo lo que necesitas para crecer
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {tools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
