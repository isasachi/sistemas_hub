import Link from "next/link";
import { HeroShowcaseWall } from "./HeroShowcaseWall";
import { HERO_COUNTER } from "@/lib/home/stats";

// Hero estilo Apple: silencio, jerarquía tipográfica y UNA sola luz —
// el haz ámbar que sube desde detrás de la pared de outputs (firma).
export function HeroSection() {
  const ctaHref =
    process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup";
  const ctaLabel =
    process.env.AUTH_DISABLED === "true"
      ? "Entrar al dashboard →"
      : "Comenzar gratis →";

  return (
    <section className="relative overflow-hidden px-6 pt-24 pb-16 text-center md:pt-28">
      {/* Badge-contador (estilo "en vivo") */}
      <div className="relative z-10 mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-4 py-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[#2ccf6f]"
          aria-hidden
        />
        <span className="text-xs font-medium text-[#a1a1a6]">
          <span className="readout font-semibold text-[#f5f5f7]">{HERO_COUNTER}</span>{" "}
          activos generados con IA
        </span>
      </div>

      {/* Title — blanco sólido; "ecommerce" es el único color */}
      <h1 className="relative z-10 mx-auto mb-6 max-w-[880px] text-[clamp(42px,6.4vw,72px)] font-bold leading-[1.05] tracking-[-0.02em] text-[#f5f5f7]">
        El poder de la IA
        <br />
        al servicio de tu <span className="text-[#ff9c4d]">ecommerce</span>
      </h1>

      {/* Subtitle */}
      <p className="relative z-10 mx-auto mb-10 max-w-[560px] text-[19px] leading-[1.5] text-[#a1a1a6]">
        Anuncios, branding, landings y productos ganadores — hechos con IA en
        minutos. Mira abajo lo que la plataforma genera.
      </p>

      {/* CTAs */}
      <div className="relative z-10 mb-16 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={ctaHref}
          className="jr-cta rounded-full px-7 py-3 text-[15px] font-semibold no-underline"
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

      {/* Pared de outputs bañada por el haz ámbar (única luz de la página) */}
      <div className="relative z-10 -mx-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-32 -bottom-24 top-0"
          style={{
            background:
              "radial-gradient(52% 78% at 50% 100%, rgba(255,140,60,0.20) 0%, rgba(255,140,60,0.07) 45%, transparent 72%)",
          }}
        />
        <p className="relative mb-5 text-[13px] text-[#6e6e73]">
          Generado por la plataforma —{" "}
          <span className="text-[#a1a1a6]">ejemplos reales, sin humo</span>
        </p>
        <HeroShowcaseWall />
      </div>
    </section>
  );
}
