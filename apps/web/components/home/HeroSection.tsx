import Link from "next/link";
import { HeroShowcaseWall } from "./HeroShowcaseWall";
import { HERO_COUNTER } from "@/lib/home/stats";

// Hero: rejilla vertical tenue, badge "en vivo", el titular con LA FIRMA del
// sistema (.lp-cut) y la pared de outputs (marquee de assets reales).
//
// La firma es el mecanismo del logotipo: UN solo filo vertical corta las dos
// líneas del titular, carmesí a la izquierda y crema a la derecha, cayendo
// DENTRO de una palabra. Por eso .lp-cut va en el <h1> y no en cada línea —
// una sola caja de degradado es lo que hace que el corte quede alineado entre
// las dos, como LEG|ACY sobre BR|AND. Es el único gesto audaz de la pantalla:
// el resto es crema y silencio (BRANDBOOK §5).
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
        <span className="font-[Archivo] text-[12px] font-medium text-[#a98c88]">
          <span className="font-semibold text-[#f6f2eb]">{HERO_COUNTER}</span>{" "}
          activos generados con IA
        </span>
      </div>

      {/* Title — LA FIRMA: el corte del logotipo sobre el titular */}
      <h1
        className="lp-serif lp-cut relative z-[1] mx-auto mb-6 w-fit max-w-[900px] text-[clamp(40px,6vw,64px)] leading-[1.08]"
        style={{ "--cut-at": "43%" } as React.CSSProperties}
      >
        El poder de la IA
        <br />
        al servicio de tu ecommerce
      </h1>

      {/* Subtitle */}
      <p className="relative z-[1] mx-auto mb-9 max-w-[560px] font-[Archivo] text-[17px] leading-[1.6] text-[#c9b4ae]">
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
