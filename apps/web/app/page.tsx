import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { StatsBar } from "@/components/home/StatsBar";
import { ShowcaseCard } from "@/components/home/ShowcaseCard";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { tools } from "@/lib/tools";

// Card ancha del bento (2 columnas): la calculadora, que tiene el preview con
// más contenido. Orden explícito del grid; tools nuevas van al final.
const WIDE_SLUGS = new Set(["calculadora-costos"]);
const BENTO_ORDER = [
  "calculadora-costos",
  "generador-anuncios",
  "generador-branding",
  "buscador-productos",
  "generador-landing",
];
const bentoIndex = (slug: string) => {
  const i = BENTO_ORDER.indexOf(slug);
  return i === -1 ? BENTO_ORDER.length : i;
};

export default function Home() {
  // Solo tools en producción — sin cards "Próximamente" en la landing de ventas.
  const liveTools = tools
    .filter((t) => t.status === "live")
    .sort((a, b) => bentoIndex(a.slug) - bentoIndex(b.slug));
  const ctaHref =
    process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup";
  const ctaLabel =
    process.env.AUTH_DISABLED === "true"
      ? "Entrar al dashboard →"
      : "Comenzar gratis →";

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <StatsBar />

        {/* Bento de herramientas — sneak peek + stats por tool */}
        <section id="herramientas" className="max-w-[1100px] mx-auto px-8 py-14">
          <div className="mb-10 text-center">
            <Eyebrow label="Herramientas" center className="mb-3" />
            <h2 className="gradient-text text-[clamp(26px,3.2vw,34px)] font-bold">
              Todo lo que necesitas para vender
            </h2>
            <p className="mx-auto mt-2.5 max-w-[480px] text-[15px] text-[#bdbdbd]">
              Cada herramienta, con un ejemplo real de lo que genera. Sin humo.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveTools.map((tool) => (
              <ShowcaseCard
                key={tool.slug}
                tool={tool}
                wide={WIDE_SLUGS.has(tool.slug)}
              />
            ))}
          </div>
        </section>

        {/* Cierre — CTA final */}
        <section className="px-8 pb-20 pt-6">
          <div className="jr-card relative mx-auto max-w-[860px] overflow-hidden rounded-3xl px-8 py-14 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(70% 90% at 50% 0%, rgba(255,150,90,0.12) 0%, transparent 65%)",
              }}
            />
            <h2 className="gradient-text relative text-[clamp(24px,3vw,32px)] font-bold">
              Tu próxima campaña empieza aquí
            </h2>
            <p className="relative mx-auto mt-2.5 max-w-[420px] text-[15px] text-[#bdbdbd]">
              Crea tu cuenta y genera tu primer activo con IA en minutos.
            </p>
            <Link
              href={ctaHref}
              className="jr-cta relative mt-7 inline-block rounded-full px-8 py-3.5 text-[15px] font-bold no-underline"
            >
              {ctaLabel}
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
