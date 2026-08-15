import Link from "next/link";
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
      : "Comenzar gratis";

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
              <span aria-hidden className="text-[11px] leading-none text-[#d6a860] opacity-70">✦</span>
              <span className="lp-eyebrow">Herramientas</span>
              <span aria-hidden className="text-[11px] leading-none text-[#d6a860] opacity-70">✦</span>
            </div>
            <h2 className="lp-serif lp-metal mx-auto max-w-[720px] text-[clamp(30px,4vw,46px)] leading-[1.12]">
              Todo lo que necesitas para vender
            </h2>
            <p className="mx-auto mt-4 max-w-[480px] font-[Lato] text-[15px] leading-[1.6] text-[#bebebe]">
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

        {/* Cierre — CTA final (hero-card con glow naranja envolvente) */}
        <section className="px-8 pb-24 pt-8">
          <div className="lp-hero-card relative mx-auto max-w-[1000px] px-8 py-20 text-center">
            <div className="mb-8 flex items-center justify-between">
              <span className="jr-wordmark text-[11px] text-[#bdbdbd]">JR AI HUB</span>
              <span className="lp-label !text-[10px]">© 2026</span>
            </div>
            <h2
              className="relative mx-auto max-w-[640px] text-[clamp(30px,4.4vw,52px)] font-bold leading-[1.1]"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgb(214, 214, 214) 0%, rgb(150, 150, 150) 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
              }}
            >
              Tu próxima campaña empieza aquí
            </h2>
            <p className="relative mx-auto mt-4 max-w-[440px] font-[Lato] text-[16px] leading-[1.6] text-[#cfcfcf]">
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
