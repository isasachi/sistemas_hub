import Link from "next/link";
import { HeroShowcaseWall } from "./HeroShowcaseWall";
import { HERO_COUNTER } from "@/lib/home/stats";

// Hero del sistema de referencia: eyebrow-badge, titular serif de display
// con la palabra clave en itálica ámbar, y la pared de outputs (spec-cards).
export function HeroSection() {
  const ctaHref =
    process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup";
  const ctaLabel =
    process.env.AUTH_DISABLED === "true"
      ? "Entrar al dashboard →"
      : "Comenzar gratis →";

  return (
    <section className="jr-grid relative overflow-hidden px-6 pt-16 pb-14 text-center md:pt-20">
      {/* Badge-contador (estilo "en vivo") */}
      <div className="relative z-10 mb-7 inline-flex items-center gap-2 rounded-full border border-[rgba(255,240,220,0.10)] bg-[rgba(255,240,220,0.04)] px-4 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4cd07d]" aria-hidden />
        <span className="text-xs font-medium text-[#a8a094]">
          <span className="readout font-semibold text-[#f3efe8]">{HERO_COUNTER}</span>{" "}
          activos generados con IA
        </span>
      </div>

      {/* Title — serif de display; "ecommerce" en itálica ámbar */}
      <h1 className="font-display relative z-10 mx-auto mb-6 max-w-[840px] text-[clamp(38px,5.6vw,64px)] font-medium leading-[1.08] tracking-[-0.01em] text-[#f3efe8]">
        El poder de la IA
        <br />
        al servicio de tu{" "}
        <span className="italic text-[#ff9c4d]">ecommerce</span>
      </h1>

      {/* Subtitle */}
      <p className="relative z-10 mx-auto mb-9 max-w-[540px] text-[17px] leading-[1.6] text-[#a8a094]">
        Anuncios, branding, landings y productos ganadores — hechos con IA en
        minutos. Mira abajo lo que la plataforma genera.
      </p>

      {/* CTAs */}
      <div className="relative z-10 mb-14 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={ctaHref}
          className="jr-cta rounded-full px-7 py-3 text-[15px] font-bold no-underline"
        >
          {ctaLabel}
        </Link>
        <a
          href="#herramientas"
          className="jr-btn-secondary rounded-full px-6 py-3 text-[15px] font-medium no-underline"
        >
          Ver herramientas
        </a>
      </div>

      {/* Pared de outputs auto-scroll (el "trusted by" de la plataforma) */}
      <div className="relative z-10 -mx-6">
        <p className="spec-label relative mb-5 !text-[10px]">
          Generado por la plataforma — ejemplos reales, sin humo
        </p>
        <HeroShowcaseWall />
      </div>
    </section>
  );
}
