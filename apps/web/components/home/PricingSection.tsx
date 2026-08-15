import Link from "next/link";
import { Check } from "lucide-react";

// Precios TEMPORALES — inferidos de la marca (JR, mercado peruano → soles) y de
// lo que la plataforma ya limita de verdad: 5 tools en producción, cuota de
// generación por paso (GEN_PER_STEP_LIMIT) y el backstop diario global
// (GEN_GLOBAL_DAILY_LIMIT, 500). No hay cobro cableado: los botones llevan a
// signup y el plan de agencia a contacto.
// ponytail: constante estática hasta que exista pasarela de pago.
interface Plan {
  name: string;
  price: string;
  period: string;
  pitch: string;
  features: string[];
  cta: string;
  featured?: boolean;
  href?: string;
}

const PLANS: Plan[] = [
  {
    name: "Explorador",
    price: "S/ 0",
    period: "para siempre",
    pitch: "Para probar el hub y sacar tu primer activo.",
    features: [
      "Buscador de productos completo",
      "10 generaciones con IA al mes",
      "1 marca guardada",
      "Anuncios y landing en calidad estándar",
    ],
    cta: "Comenzar gratis",
  },
  {
    name: "Operador",
    price: "S/ 149",
    period: "al mes",
    pitch: "Para quien pauta todas las semanas y necesita volumen.",
    features: [
      "Las 5 herramientas sin límite de sesiones",
      "300 generaciones con IA al mes",
      "Video ads UGC (3 renders por guión)",
      "5 marcas guardadas",
      "Descarga en alta y sin marca de agua",
    ],
    cta: "Comenzar gratis",
    featured: true,
  },
  {
    name: "Agencia",
    price: "S/ 399",
    period: "al mes",
    pitch: "Para equipos que manejan varias cuentas a la vez.",
    features: [
      "Todo lo del plan Operador",
      "Generaciones ilimitadas (uso justo)",
      "Marcas y usuarios ilimitados",
      "Nichos a pedido en el buscador",
      "Soporte directo del equipo JR",
    ],
    cta: "Hablar con el equipo",
    href: "https://jrconsulting.com.pe",
  },
];

export function PricingSection() {
  const signupHref =
    process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup";

  return (
    <section id="precios" className="mx-auto max-w-[1160px] px-8 py-16">
      <div className="mb-12 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span aria-hidden className="text-[11px] leading-none text-[#d6a860] opacity-70">✦</span>
          <span className="lp-eyebrow">Precios</span>
          <span aria-hidden className="text-[11px] leading-none text-[#d6a860] opacity-70">✦</span>
        </div>
        <h2 className="lp-serif lp-metal mx-auto max-w-[720px] text-[clamp(30px,4vw,46px)] leading-[1.12]">
          Un plan por cada etapa
        </h2>
        <p className="mx-auto mt-4 max-w-[480px] font-[Lato] text-[15px] leading-[1.6] text-[#bebebe]">
          Empieza gratis. Sube de plan cuando el volumen lo pida.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`lp-card flex flex-col p-8 ${
              plan.featured ? "border-[rgba(255,155,74,0.45)] lg:-mt-4 lg:pb-10" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="lp-label !text-[10px] !text-[#cfcfcf]">{plan.name}</span>
              {plan.featured && (
                <span className="lp-eyebrow !text-[10px] !tracking-[0.16em]">
                  Más popular
                </span>
              )}
            </div>

            <div className="mt-5 flex items-baseline gap-2">
              <span className="readout text-[40px] font-bold leading-none text-[#ffffff]">
                {plan.price}
              </span>
              <span className="font-[Lato] text-[13px] text-[#8f8f8f]">
                {plan.period}
              </span>
            </div>

            <p className="mt-3 font-[Lato] text-[14px] leading-[1.6] text-[#bebebe]">
              {plan.pitch}
            </p>

            <ul className="mt-7 mb-8 flex list-none flex-col gap-3 p-0">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check
                    aria-hidden
                    className="mt-[3px] h-4 w-4 shrink-0 text-[#d6a860]"
                  />
                  <span className="font-[Lato] text-[14px] leading-[1.5] text-[#cfcfcf]">
                    {f}
                  </span>
                </li>
              ))}
            </ul>

            {plan.href ? (
              <a
                href={plan.href}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-btn mt-auto rounded-lg px-6 py-3 text-[14px] no-underline"
              >
                {plan.cta}
              </a>
            ) : (
              <Link
                href={signupHref}
                className={`${plan.featured ? "lp-cta" : "lp-btn"} mt-auto rounded-lg px-6 py-3 text-[14px] no-underline`}
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className="mt-8 text-center font-[Lato] text-[13px] text-[#8f8f8f]">
        Precios referenciales en proceso de definición. Incluyen IGV. Cancelas cuando quieras.
      </p>
    </section>
  );
}
