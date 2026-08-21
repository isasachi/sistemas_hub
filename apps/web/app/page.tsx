import Link from "next/link";
import { Wordmark } from "@/components/layout/Wordmark";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { StatsBar } from "@/components/home/StatsBar";
import { LandingToolCard } from "@/components/home/LandingToolCard";
import { PricingSection } from "@/components/home/PricingSection";
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
      ? "Entrar al dashboard"
      : "Comenzar ahora";

  return (
    <div className="lp-root flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <StatsBar />

        {/* Bento de herramientas — sneak peek + stats por tool */}
        <section id="herramientas" className="mx-auto max-w-[1160px] px-8 py-16">
          <div className="mb-12 text-center">
            <div className="mb-4 flex items-center justify-center gap-2">
              <span aria-hidden className="text-[11px] leading-none text-[#e8dcd6] opacity-70">✦</span>
              <span className="lp-eyebrow">Herramientas</span>
              <span aria-hidden className="text-[11px] leading-none text-[#e8dcd6] opacity-70">✦</span>
            </div>
            {/* ⚠️ "Seis" cuenta las tools `status: "live"` de lib/tools.ts, que
                son las que arma `liveTools` justo abajo. Al publicar la séptima
                hay que cambiar la palabra acá: es el único número escrito a mano
                sobre una grilla que se llena sola. */}
            <h2 className="lp-serif lp-metal mx-auto max-w-[720px] text-[clamp(30px,4vw,46px)] leading-[1.12]">
              Seis herramientas, un solo flujo
            </h2>
            <p className="mx-auto mt-4 max-w-[480px] font-[Lato] text-[15px] leading-[1.6] text-[#a98c88]">
              Cada herramienta, con un ejemplo real de lo que genera.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {liveTools.map((tool) => (
              <LandingToolCard
                key={tool.slug}
                tool={tool}
                wide={WIDE_SLUGS.has(tool.slug)}
              />
            ))}
          </div>
        </section>

        <PricingSection />

        {/* Cierre — CTA final (hero-card con glow carmesí envolvente) */}
        <section className="px-8 pb-24 pt-8">
          <div className="lp-hero-card relative mx-auto max-w-[1000px] px-8 py-20 text-center">
            <div className="mb-8 flex items-center justify-between">
              <Wordmark size={18} />
              <span className="lp-label !text-[10px]">© 2026</span>
            </div>
            {/* Sin degradado plata: era el ADN metálico anterior y la marca
                no tiene metal (BRANDBOOK §2). Crema plana sobre el granate. */}
            <h2 className="lp-serif relative mx-auto max-w-[640px] text-[clamp(30px,4.4vw,52px)] leading-[1.1] text-[#f6f2eb]">
              Tu próxima campaña empieza aquí
            </h2>
            <p className="relative mx-auto mt-4 max-w-[440px] font-[Lato] text-[16px] leading-[1.6] text-[#c9b4ae]">
              Crea tu cuenta y genera tu primer activo con IA en minutos.
            </p>
            <Link
              href={ctaHref}
              className="lp-cta relative mt-9 px-8 py-3.5 text-[15px] no-underline"
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
