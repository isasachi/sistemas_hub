import Link from "next/link";
import { HeroShowcaseWall } from "./HeroShowcaseWall";
import { HERO_COUNTER } from "@/lib/home/stats";

// Hero ADN "JR Studio": rejilla vertical tenue, badge "en vivo", titular
// serif metálico con palabra dorada en itálica, CTA naranja con glow y la
// pared de outputs (marquee de assets reales).
export function HeroSection() {
  const ctaHref =
    process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup";
  const ctaLabel =
    process.env.AUTH_DISABLED === "true"
      ? "Entrar al dashboard"
      : "Comenzar gratis";

  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-14 text-center md:pt-24">
      {/* Rejilla vertical tenue del canvas */}
      <div aria-hidden className="lp-grid pointer-events-none absolute inset-0" />

      {/* Badge-contador "en vivo" */}
      <div className="relative z-[1] mb-8 inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-1.5">
        <span className="lp-live-dot" aria-hidden />
        <span className="font-[Poppins] text-[12px] font-medium text-[#bebebe]">
          <span className="font-semibold text-[#ffffff]">{HERO_COUNTER}</span>{" "}
          activos generados con IA
        </span>
      </div>

      {/* Title — serif metálico; "ecommerce" dorado en itálica */}
      <h1 className="lp-serif relative z-[1] mx-auto mb-6 max-w-[900px] text-[clamp(40px,6vw,64px)] leading-[1.08] text-[#ffffff]">
        <span className="lp-metal">El poder de la IA</span>
        <br />
        al servicio de tu{" "}
        <span className="lp-gold-word">ecommerce</span>
      </h1>

      {/* Subtitle */}
      <p className="relative z-[1] mx-auto mb-9 max-w-[560px] font-[Lato] text-[17px] leading-[1.6] text-[#cfcfcf]">
        Anuncios, branding, landings y productos ganadores — hechos con IA en
        minutos. Mira abajo lo que la plataforma genera.
      </p>

      {/* CTAs */}
      <div className="relative z-[1] mb-14 flex flex-wrap items-center justify-center gap-3">
        <Link href={ctaHref} className="lp-cta px-7 py-3.5 text-[15px] no-underline">
          {ctaLabel}
        </Link>
        <a href="#herramientas" className="lp-btn px-6 py-3.5 text-[15px] no-underline">
          Ver herramientas
        </a>
      </div>

      {/* Pared de outputs auto-scroll (el "trusted by" de la plataforma) */}
      <div className="relative z-[1] -mx-6">
        <p className="lp-label relative mb-5 !text-[10px]">
          Generado por la plataforma — ejemplos reales, sin humo
        </p>
        <HeroShowcaseWall />
      </div>
    </section>
  );
}
