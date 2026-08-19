import { Check } from "lucide-react";

// Card ÚNICA de lanzamiento: $29/mes con acceso completo. Reemplaza a la tabla
// de 3 planes (Explorador/Operador/Agencia), que eran precios inventados sin
// cobro cableado detrás.
//
// El cobro lo procesa Whop. WHOP_CHECKOUT_URL es el link de checkout del plan
// creado en el dashboard de Whop (Dashboard > Products > el plan de $29/mes).
// Es server-only a propósito — esta sección se renderiza en el servidor, así
// que no necesita el prefijo NEXT_PUBLIC.
//
// ponytail: link al checkout alojado de Whop, no el embed. Pasar a
// <WhopCheckoutEmbed planId=...> (@whop/checkout) cuando se quiera pagar sin
// salir de la landing.
const FEATURES = [
  "Las 6 herramientas del hub, sin restricción de sesiones",
  "Buscador de productos con el inventario completo",
  "Anuncios estáticos y video ads UGC verticales",
  "Generador de branding y de landing pages",
  "Calculadora de costos con exportación a Excel",
  "Cancelas cuando quieras",
];

export function PricingSection() {
  // Sin link de Whop configurado la card no puede cobrar: manda a signup en vez
  // de dejar un botón muerto en producción.
  //
  // ⚠️ ponytail: PAGAR TODAVÍA NO DA ACCESO. El único gate del hub es
  // LOGIN_ALLOWLIST (lista de emails por env var, en proxy.ts): nada escucha a
  // Whop, así que un pago exitoso no habilita nada. NO pegues un
  // WHOP_CHECKOUT_URL real en producción hasta que exista el webhook
  // (payment.succeeded → tabla de entitlements) y que proxy.ts consulte esa
  // tabla en vez de la allowlist. Nota de diseño para ese webhook: proxy.ts
  // saca de "/" a los usuarios logueados, así que quien compra desde la landing
  // es anónimo y NO tiene user_id de Supabase — la única clave de unión es el
  // email que Whop recoge, y el flujo es pagar y después registrarse con ese
  // mismo email.
  const checkoutUrl = process.env.WHOP_CHECKOUT_URL;
  const href =
    checkoutUrl ??
    (process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup");
  const external = Boolean(checkoutUrl);

  return (
    <section id="precios" className="mx-auto max-w-[1160px] px-8 py-16">
      <div className="mb-12 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span aria-hidden className="text-[11px] leading-none text-[#d6a860] opacity-70">✦</span>
          <span className="lp-eyebrow">Acceso</span>
          <span aria-hidden className="text-[11px] leading-none text-[#d6a860] opacity-70">✦</span>
        </div>
        <h2 className="lp-serif lp-metal mx-auto max-w-[720px] text-[clamp(30px,4vw,46px)] leading-[1.12]">
          Un solo plan, todo adentro
        </h2>
        <p className="mx-auto mt-4 max-w-[480px] font-[Lato] text-[15px] leading-[1.6] text-[#bebebe]">
          Acceso completo a la plataforma. Sin niveles ni funciones bloqueadas.
        </p>
      </div>

      <div className="mx-auto max-w-[440px]">
        <div className="lp-card flex flex-col border-[rgba(255,155,74,0.45)] p-8">
          <div className="flex items-center justify-between">
            <span className="lp-label !text-[10px] !text-[#cfcfcf]">
              Acceso completo
            </span>
            <span className="lp-eyebrow !text-[10px] !tracking-[0.16em]">
              Lanzamiento
            </span>
          </div>

          <div className="mt-5 flex items-baseline gap-2">
            <span className="readout text-[40px] font-bold leading-none text-[#ffffff]">
              $29
            </span>
            <span className="font-[Lato] text-[13px] text-[#8f8f8f]">
              USD al mes
            </span>
          </div>

          <p className="mt-3 font-[Lato] text-[14px] leading-[1.6] text-[#bebebe]">
            Todo el hub, desde el primer día. Un precio, sin letra chica.
          </p>

          <ul className="mt-7 mb-8 flex list-none flex-col gap-3 p-0">
            {FEATURES.map((f) => (
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

          <a
            href={href}
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className="lp-cta mt-auto rounded-lg px-6 py-3 text-center text-[14px] no-underline"
          >
            Suscribirme por $29 al mes
          </a>
        </div>
      </div>

      <p className="mt-8 text-center font-[Lato] text-[13px] text-[#8f8f8f]">
        Precio de lanzamiento, temporal. Pago procesado por Whop. Cancelas cuando
        quieras.
      </p>
    </section>
  );
}
