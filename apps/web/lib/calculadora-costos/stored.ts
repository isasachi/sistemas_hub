import { calcular, calcularPrecio, type CalcInputs, type PrecioInputs } from "./model";

/**
 * La tool guarda DOS tipos de sesión en la misma tabla (`calc_sessions.inputs` es jsonb):
 * el costeo de precio y el análisis de rentabilidad. El discriminador es `kind`.
 *
 * ⚠️ Las sesiones anteriores a esta versión son `CalcInputs` a secas, SIN `kind` — por eso
 * su ausencia significa "rentabilidad" y no un dato faltante. Sin eso, cada sesión guardada
 * hasta hoy dejaría de abrirse.
 */

export type PrecioSessionInputs = PrecioInputs & { kind: "precio" };
export type RentaSessionInputs = CalcInputs & { kind?: "rentabilidad" };
export type StoredInputs = PrecioSessionInputs | RentaSessionInputs;

export const esPrecio = (i: StoredInputs): i is PrecioSessionInputs =>
  (i as PrecioSessionInputs).kind === "precio";

/** KPIs para la card del historial — evita recalcular el modelo entero en el listado. */
export type StoredSnapshot =
  | {
      kind: "precio";
      precioMinimo: number;
      precioManual: number;
      margenEsperado: number;
      utilidadManual: number;
    }
  | {
      kind?: "rentabilidad";
      funnel: "leads" | "mensajes";
      precioVenta: number;
      profitNeto: number;
      margenNeto: number;
      roiAds: number;
    };

export function snapshotDe(inputs: StoredInputs): StoredSnapshot {
  if (esPrecio(inputs)) {
    const r = calcularPrecio(inputs);
    return {
      kind: "precio",
      precioMinimo: r.precioMinimo,
      precioManual: inputs.precioManual,
      margenEsperado: inputs.margenEsperado,
      utilidadManual: r.manual.utilidad,
    };
  }
  const r = calcular(inputs);
  return {
    kind: "rentabilidad",
    funnel: inputs.funnel,
    precioVenta: inputs.operacion.precioVenta,
    profitNeto: r.pg.profitNeto,
    margenNeto: r.pg.margenNeto,
    roiAds: r.pg.roiAds,
  };
}

/** Título de la card en el historial del dashboard. */
export function tituloDe(s: StoredSnapshot): string {
  if (s.kind === "precio")
    return `Precio · S/ ${Math.round(Number.isFinite(s.precioMinimo) ? s.precioMinimo : 0)}`;
  return `${s.funnel === "leads" ? "Por leads" : "Por mensajes"} · S/ ${Math.round(s.precioVenta)}`;
}
