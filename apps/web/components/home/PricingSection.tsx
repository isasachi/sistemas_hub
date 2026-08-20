import { PlanesGrid, IncluidoEnTodos } from "@/components/planes/PlanesGrid";

/**
 * Precios de la home. La tabla la pinta `PlanesGrid`, el MISMO componente que
 * usa `/suscripcion`, y los números salen de `PLANS` (@ph/shared).
 *
 * ⚠️ Esto reemplaza una tabla inventada. Hasta el 2026-08-20 la home vendía
 * "Explorador S/ 0 · Operador S/ 149 · Agencia S/ 399" con features que no
 * existían ("marcas guardadas", "generaciones ilimitadas"): eran precios
 * provisionales de antes de que hubiera cobro, y quedaron publicados después de
 * que el paywall real saliera a producción. Dos tablas de precios = una miente.
 */
export function PricingSection() {
  // Sin sesión no se puede crear un checkout (necesita el `user.id` para el
  // metadata), así que desde la home el CTA lleva a registrarse y el paywall
  // cobra del otro lado. Con AUTH_DISABLED el registro no existe.
  const destino = process.env.AUTH_DISABLED === "true" ? "/dashboard" : "/signup";

  return (
    <section id="precios" className="mx-auto max-w-[1160px] px-8 py-16">
      <div className="mb-12 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span aria-hidden className="text-[11px] leading-none text-[#e8dcd6] opacity-70">✦</span>
          <span className="lp-eyebrow">Precios</span>
          <span aria-hidden className="text-[11px] leading-none text-[#e8dcd6] opacity-70">✦</span>
        </div>
        <h2 className="lp-serif lp-metal mx-auto max-w-[720px] text-[clamp(30px,4vw,46px)] leading-[1.12]">
          Un plan por cada etapa
        </h2>
        <p className="mx-auto mt-4 max-w-[520px] font-[Lato] text-[15px] leading-[1.6] text-[#a98c88]">
          Prueba 3 días gratis en cualquier plan. Cancelas cuando quieras.
        </p>
      </div>

      <PlanesGrid hrefDe={() => destino} />
      <IncluidoEnTodos />
    </section>
  );
}
