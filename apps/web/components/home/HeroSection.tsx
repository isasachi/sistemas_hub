import Link from "next/link";
import { HeroShowcaseWall } from "./HeroShowcaseWall";
import { HERO_COUNTER } from "@/lib/home/stats";

export function HeroSection() {
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

      {/* Title */}
      <h1 className="relative z-10 text-[clamp(36px,5vw,52px)] font-bold leading-[1.12] mb-5 max-w-[680px] mx-auto">
        <span className="gradient-text">El poder de la IA al servicio</span>
        <br />
        <span className="gradient-text">de tu</span>{" "}
        <span className="accent-text">ecommerce</span>
      </h1>

      {/* Subtitle */}
      <p className="relative z-10 text-[17px] text-[#bdbdbd] leading-[1.65] max-w-[520px] mx-auto mb-9">
        Anuncios, branding, landings y productos ganadores — hechos con IA en
        minutos. Mira abajo lo que la plataforma genera.
      </p>

      {/* CTAs */}
      <div className="relative z-10 flex items-center justify-center gap-3 flex-wrap mb-12">
        <Link
          href={process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup"}
          className="jr-cta text-[15px] font-bold px-8 py-3.5 rounded-full no-underline"
        >
          {process.env.AUTH_DISABLED === "true" ? "Entrar al dashboard →" : "Comenzar gratis →"}
        </Link>
        <a
          href="#herramientas"
          className="bg-transparent text-[#bdbdbd] border border-white/[0.12] hover:text-[#f5f5f5] hover:border-white/[0.25] hover:bg-white/[0.04] text-[15px] font-medium px-6 py-3.5 rounded-full transition-all duration-200 no-underline"
        >
          Ver herramientas
        </a>
      </div>

      {/* Signature — pared de outputs auto-scroll */}
      <div className="relative z-10 -mx-8">
        <HeroShowcaseWall />
      </div>
    </section>
  );
}
