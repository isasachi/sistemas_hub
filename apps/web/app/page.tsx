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
    <div className="min-h-screen flex flex-col bg-black">
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <StatsBar />

        {/* Bento de herramientas — sneak peek + stats por tool */}
        <section id="herramientas" className="max-w-[1120px] mx-auto px-8 py-20">
          <div className="mb-14 text-center">
            <Eyebrow label="Herramientas" center className="mb-4" />
            <h2 className="text-[clamp(30px,3.8vw,44px)] font-semibold tracking-[-0.02em] text-[#f5f5f7]">
              Todo lo que necesitas para vender
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[17px] leading-[1.5] text-[#a1a1a6]">
              Cada herramienta, con un ejemplo real de lo que genera. Sin humo.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        <section className="px-8 pb-28 pt-10">
          <div className="jr-card relative mx-auto max-w-[880px] overflow-hidden rounded-[28px] px-8 py-20 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(70% 90% at 50% 0%, rgba(255,150,90,0.10) 0%, transparent 65%)",
              }}
            />
            <h2 className="relative text-[clamp(28px,3.4vw,40px)] font-semibold tracking-[-0.02em] text-[#f5f5f7]">
              Tu próxima campaña empieza aquí
            </h2>
            <p className="relative mx-auto mt-3 max-w-[420px] text-[17px] leading-[1.5] text-[#a1a1a6]">
              Crea tu cuenta y genera tu primer activo con IA en minutos.
            </p>
            <Link
              href={ctaHref}
              className="jr-cta relative mt-8 inline-block rounded-full px-8 py-3 text-[15px] font-semibold no-underline"
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
