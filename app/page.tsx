import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { StatsBar } from "@/components/home/StatsBar";
import { ToolCard } from "@/components/home/ToolCard";
import { tools } from "@/lib/tools";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[#080810]">
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <StatsBar />

        {/* Tools grid */}
        <section id="herramientas" className="max-w-[1100px] mx-auto px-8 py-14">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-px w-10 bg-white/[0.08]" />
              <span className="text-[11px] font-bold text-[#475569] tracking-[2px] uppercase">
                Las 5 herramientas
              </span>
              <div className="h-px w-10 bg-white/[0.08]" />
            </div>
            <h2 className="text-2xl font-bold text-[#f1f5f9] tracking-[-0.3px]">
              Todo lo que necesitas para crecer
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-3.5">
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
