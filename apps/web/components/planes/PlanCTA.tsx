"use client";

import { PLANS, RAW_BUCKET_LABEL, lockedBuckets, type Tier } from "@ph/shared";

/**
 * El botón que lleva al checkout de un plan. Lo comparten la tabla de precios
 * (`PlanesGrid`, que usan la home y `/suscripcion`) y el bloque "Tu plan" de Mi
 * cuenta, que son los dos lugares desde donde se puede cambiar de plan.
 *
 * Existe por UNA razón: pedir confirmación antes de BAJAR de plan. Subir no
 * necesita permiso — no se pierde nada — pero bajar recorta rangos del buscador,
 * productos por rango y créditos de imagen, y el clic que lo dispara es idéntico
 * al de subir. El resto del árbol se queda en el servidor: la frontera de cliente
 * es solo este botón.
 *
 * ⚠️ SIGUE SIENDO UN `<a>`, no un `<Link>`. Ese href crea una checkout
 * configuration en Whop y Next prefetchea los `<Link>`: se crearían con solo pasar
 * el mouse por encima.
 *
 * ponytail: `window.confirm` nativo. Es bloqueante, accesible y no arrastra estado
 * ni librería; cambiarlo por un modal propio es un reemplazo de este archivo, no un
 * rediseño de nada más.
 */
export function PlanCTA({
  tier,
  actual,
  href,
  className,
  children,
}: {
  tier: Tier;
  /** Plan contratado hoy. null = no tiene (o no hay sesión): nunca es una bajada. */
  actual: Tier | null;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const baja = actual != null && tier < actual;

  return (
    <a
      href={href}
      className={className}
      onClick={
        baja
          ? (e) => {
              if (!window.confirm(avisoDeBaja(actual, tier))) e.preventDefault();
            }
          : undefined
      }
    >
      {children}
    </a>
  );
}

/**
 * Qué se pierde, en concreto. Los números salen de `PLANS` — escribirlos a mano acá
 * es cómo el aviso termina prometiendo algo distinto de lo que el servidor sirve.
 */
export function avisoDeBaja(actual: Tier, nuevo: Tier): string {
  const de = PLANS[actual];
  const a = PLANS[nuevo];

  // Rangos que hoy ve y dejará de ver. Se derivan, no se listan a mano.
  const pierdeRangos = lockedBuckets(nuevo).filter((b) => !lockedBuckets(actual).includes(b));

  const lineas = [
    `Vas a cambiar de ${de.nombre} a ${a.nombre}.`,
    "",
    "Perderás:",
    `· Productos por rango: ${de.porRango} → ${a.porRango}`,
    `· Imágenes al mes: ${de.creditos} → ${a.creditos}`,
  ];
  if (pierdeRangos.length) {
    lineas.push(
      `· Dejarás de ver ${pierdeRangos.map((b) => RAW_BUCKET_LABEL[b]).join(" y ")}`,
    );
  }
  lineas.push(
    "",
    // Es cierto por construcción: el plan anterior se cancela al FIN del período,
    // no al instante, y mientras tanto `getAccess` sigue devolviendo el tier alto.
    `Mantienes los beneficios de ${de.nombre} hasta que termine el período que ya pagaste.`,
    "",
    "¿Confirmas el cambio?",
  );
  return lineas.join("\n");
}
