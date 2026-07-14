import Link from "next/link";
import { MousePointer2 } from "lucide-react";
import { HeroShowcaseWall } from "./HeroShowcaseWall";
import { HERO_COUNTER } from "@/lib/home/stats";

// Chips-cursor flotantes (firma del rediseño): etiquetas estilo cursor
// colaborativo que nombran outputs reales de las tools, como los tags
// "Checkboxes upload" del modelo de referencia. Solo desktop.
function CursorChip({
  label,
  color,
  pos,
  flip = false,
  delay = "0s",
}: {
  label: string;
  color: string;
  pos: string;
  flip?: boolean;
  delay?: string;
}) {
  return (
    <div
      aria-hidden
      className={`jr-float pointer-events-none absolute z-10 hidden items-start gap-1 lg:flex ${pos}`}
      style={{ animationDelay: delay }}
    >
      {!flip && (
        <MousePointer2 className="mt-3.5 h-4 w-4" style={{ color, fill: color }} />
      )}
      <span className="rounded-full border border-white/[0.12] bg-[#161616] px-3.5 py-1.5 text-[12px] font-semibold text-[#f5f5f5] shadow-[0_10px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]">
        {label}
      </span>
      {flip && (
        <MousePointer2
          className="mt-3.5 h-4 w-4 -scale-x-100"
          style={{ color, fill: color }}
        />
      )}
    </div>
  );
}

export function HeroSection() {
  const ctaHref =
    process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup";
  const ctaLabel =
    process.env.AUTH_DISABLED === "true"
      ? "Entrar al dashboard →"
      : "Comenzar gratis →";

  return (
    <section className="relative overflow-hidden px-8 pt-20 pb-14 text-center jr-grid">
      {/* Rayo cálido desde la esquina superior izquierda */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(100% 50% at -8% -8%, rgba(255,150,90,0.20) 0%, rgba(255,150,90,0.08) 35%, transparent 60%)",
        }}
      />
      {/* Glow cálido superior */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[320px] rounded-full"
        style={{
          background:
            "radial-gradient(60% 80% at 50% 0%, rgba(230,210,180,0.14) 0%, transparent 60%)",
        }}
      />

      {/* Chips-cursor con outputs reales, flanqueando el titular */}
      <CursorChip
        label="Producto validado · 142 ads"
        color="#ff9c4d"
        pos="left-[max(24px,7%)] top-[168px]"
        flip
      />
      <CursorChip
        label="Anuncio 9:16 generado"
        color="#2ccf6f"
        pos="right-[max(24px,7%)] top-[248px]"
        delay="2.4s"
      />

      {/* Badge-contador (estilo "en vivo") */}
      <div className="relative z-10 inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.12] rounded-full px-4 py-1.5 mb-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <span
          className="w-1.5 h-1.5 rounded-full bg-[#2ccf6f] shadow-[0_0_8px_#2ccf6f]"
          aria-hidden
        />
        <span className="text-[#cfcfcf] text-xs font-semibold tracking-[0.2px]">
          <span className="readout text-[#f5f5f5] font-bold">{HERO_COUNTER}</span>{" "}
          activos generados con IA
        </span>
      </div>

      {/* Title — "ecommerce" lleva el subrayado-marcador del modelo */}
      <h1 className="relative z-10 mx-auto mb-6 max-w-[720px] text-[clamp(36px,5vw,54px)] font-bold leading-[1.12]">
        <span className="gradient-text">El poder de la IA</span>
        <br />
        <span className="gradient-text">al servicio de tu</span>{" "}
        <span className="relative inline-block">
          <span className="gradient-text">ecommerce</span>
          <svg
            aria-hidden
            className="absolute -bottom-[0.16em] left-0 h-[0.18em] w-full"
            viewBox="0 0 200 10"
            preserveAspectRatio="none"
          >
            <path
              d="M4 7.5 Q 100 1.5 196 6.5"
              stroke="#ff9c4d"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              opacity="0.9"
            />
          </svg>
        </span>
      </h1>

      {/* Subtitle */}
      <p className="relative z-10 text-[17px] text-[#bdbdbd] leading-[1.65] max-w-[520px] mx-auto mb-9">
        Anuncios, branding, landings y productos ganadores — hechos con IA en
        minutos. Mira abajo lo que la plataforma genera.
      </p>

      {/* CTAs */}
      <div className="relative z-10 flex items-center justify-center gap-3 flex-wrap mb-12">
        <Link
          href={ctaHref}
          className="jr-cta text-[15px] font-bold px-8 py-3.5 rounded-full no-underline"
        >
          {ctaLabel}
        </Link>
        <a
          href="#herramientas"
          className="bg-transparent text-[#bdbdbd] border border-white/[0.12] hover:text-[#f5f5f5] hover:border-white/[0.25] hover:bg-white/[0.04] text-[15px] font-medium px-6 py-3.5 rounded-full transition-all duration-200 no-underline"
        >
          Ver herramientas
        </a>
      </div>

      {/* Pared de outputs auto-scroll (el "trusted by" de la plataforma) */}
      <div className="relative z-10 -mx-8">
        <p className="mb-4 text-[13px] text-[#8a8a8a]">
          Generado por la plataforma —{" "}
          <span className="text-[#bdbdbd]">ejemplos reales, sin humo</span>
        </p>
        <HeroShowcaseWall />
      </div>
    </section>
  );
}
