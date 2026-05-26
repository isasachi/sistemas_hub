import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-8 pt-20 pb-18 text-center">
      {/* Ambient glow — amber */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, rgba(245,158,11,0.12) 0%, transparent 70%)",
        }}
      />
      {/* Ambient glow — red */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-10 left-[30%] w-[300px] h-[200px] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, rgba(239,68,68,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Badge */}
      <div className="relative z-10 inline-flex items-center gap-2 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.22)] rounded-full px-4 py-1.5 mb-7">
        <span
          className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] shadow-[0_0_8px_#f59e0b]"
          aria-hidden
        />
        <span className="text-[#f59e0b] text-xs font-semibold tracking-[0.4px] uppercase">
          Herramientas de Marketing con IA
        </span>
      </div>

      {/* Title */}
      <h1 className="relative z-10 text-[clamp(36px,5vw,52px)] font-extrabold leading-[1.12] tracking-[-0.8px] text-[#f1f5f9] mb-5 max-w-[680px] mx-auto">
        El poder de la IA al servicio
        <br />
        de tu{" "}
        <span className="gradient-text">ecommerce</span>
      </h1>

      {/* Subtitle */}
      <p className="relative z-10 text-[17px] text-[#94a3b8] leading-[1.65] max-w-[520px] mx-auto mb-9">
        Genera anuncios, videos, branding y landing pages en minutos.
        Diseñado para marcas peruanas que quieren crecer más rápido.
      </p>

      {/* CTAs */}
      <div className="relative z-10 flex items-center justify-center gap-3 flex-wrap">
        <Link
          href="#herramientas"
          className="bg-brand-gradient text-white text-[15px] font-bold px-8 py-3.5 rounded-xl shadow-[0_4px_24px_rgba(245,158,11,0.25)] hover:opacity-[0.92] hover:shadow-[0_4px_32px_rgba(245,158,11,0.4)] hover:-translate-y-px transition-all duration-200 no-underline"
        >
          Explorar herramientas →
        </Link>
        <a
          href="#como-funciona"
          className="bg-transparent text-[#94a3b8] border border-white/[0.12] hover:text-[#f1f5f9] hover:border-white/[0.2] hover:bg-white/[0.04] text-[15px] font-medium px-6 py-3.5 rounded-xl transition-all duration-200 no-underline"
        >
          Ver cómo funciona
        </a>
      </div>
    </section>
  );
}
