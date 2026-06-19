// Modelo financiero e-com — transcripción exacta de las hojas LEADS / MENSAJES
// del archivo "ANALISIS FINANCIEROS- ACADEMY ECOM.xlsx". Puro, sin deps.

export type Funnel = "leads" | "mensajes";

export interface OperacionInputs {
  precioVenta: number;
  costoProducto: number;
  flete: number;
  fullfillment: number;
  pctPasarela: number; // 0..1
  comisionPasarela: number; // 0..1
  gastosAdminMes: number;
}

export interface EmbudoLeadsInputs {
  inversion: number;
  cpm: number;
  ctr: number; // 0..1
  velocidadCarga: number; // 0..1
  conversionRate: number; // 0..1
  pctConfirmacion: number; // 0..1
  pctRechazo: number; // 0..1
}

export interface EmbudoMensajesInputs {
  inversion: number;
  costoPorMensaje: number;
  tasaCierre: number; // 0..1
  pctRechazo: number; // 0..1
}

export interface OfertaTier {
  pctCompra: number; // 0..1
  precio: number;
  costo: number;
}

export interface CalcInputs {
  funnel: Funnel;
  operacion: OperacionInputs;
  embudoLeads?: EmbudoLeadsInputs;
  embudoMensajes?: EmbudoMensajesInputs;
  cantidad: [OfertaTier, OfertaTier, OfertaTier]; // los %compra deben sumar 1
  upsells: [OfertaTier, OfertaTier];
}

export interface CalcResult {
  embudo: Record<string, number>;
  ofertas: { ventasCantidad: number; costosCantidad: number; ventasUpsell: number; costosUpsell: number };
  pg: Record<string, number>;
}

// Excel ROUND: redondeo half-away-from-zero (no el banker's de JS).
function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.sign(n) * Math.round(Math.abs(n) * f) / f;
}

// Normaliza los %compra de una lista de tiers para que sumen 1 (como espera el SUMPRODUCT).
// Si todo es 0, los deja en 0 (sin ventas). Devuelve copia.
export function normalizarPct<T extends { pctCompra: number }>(tiers: T[]): T[] {
  const total = tiers.reduce((s, t) => s + t.pctCompra, 0);
  if (total === 0) return tiers.map((t) => ({ ...t }));
  return tiers.map((t) => ({ ...t, pctCompra: t.pctCompra / total }));
}

export function calcular(input: CalcInputs): CalcResult {
  const op = input.operacion;
  const e: Record<string, number> = {};

  // --- Embudo ---
  if (input.funnel === "leads") {
    const f = input.embudoLeads!;
    e.inversion = f.inversion;
    e.impresiones = round((f.inversion / f.cpm) * 1000);
    e.clics = round(e.impresiones * f.ctr);
    e.visualizaciones = round(e.clics * f.velocidadCarga);
    e.ventas = round(e.visualizaciones * f.conversionRate);
    e.pedidosEnviados = e.ventas * f.pctConfirmacion;
    e.devoluciones = Math.ceil(f.pctRechazo * e.pedidosEnviados);
    e.entregas = Math.floor(e.pedidosEnviados - e.devoluciones);
  } else {
    const f = input.embudoMensajes!;
    e.inversion = f.inversion;
    e.cantidadMensajes = f.inversion / f.costoPorMensaje;
    e.ventas = round(e.cantidadMensajes * f.tasaCierre);
    e.pedidosEnviados = e.ventas;
    e.devoluciones = Math.ceil(f.pctRechazo * e.pedidosEnviados);
    e.entregas = Math.floor(e.pedidosEnviados - e.devoluciones);
  }

  // --- Ofertas (base = entregas) ---
  // Las 3 ofertas por cantidad se normalizan a 100% (cada comprador elige UNA).
  // Los upsells son tasas de attach independientes (no suman 100%): NO se normalizan.
  const cant = normalizarPct(input.cantidad);
  const ups = input.upsells;
  const unidadesCant = cant.map((t) => t.pctCompra * e.entregas);
  const unidadesUps = ups.map((t) => t.pctCompra * e.entregas);
  const ventasCantidad = cant.reduce((s, t, i) => s + unidadesCant[i] * t.precio, 0);
  const costosCantidad = cant.reduce((s, t, i) => s + unidadesCant[i] * t.costo, 0);
  const ventasUpsell = ups.reduce((s, t, i) => s + unidadesUps[i] * t.precio, 0);
  const costosUpsell = ups.reduce((s, t, i) => s + unidadesUps[i] * t.costo, 0);

  // --- P&G ---
  const pg: Record<string, number> = {};
  pg.ingresosTotales = ventasCantidad + ventasUpsell;
  pg.ingresosReales = pg.ingresosTotales; // N8 (otros ingresos) = 0
  pg.costoProductoPrincipal = costosCantidad;
  pg.costoProductoOferta = costosUpsell;
  pg.costosEnvio = e.pedidosEnviados * op.flete;
  pg.costosDevoluciones =
    input.funnel === "leads" ? (e.devoluciones * op.flete) / 2 : e.devoluciones * op.flete;
  pg.costoFullfillment = op.fullfillment * e.entregas;
  pg.costosIntermediacion =
    pg.costoProductoPrincipal +
    pg.costoProductoOferta +
    pg.costosEnvio +
    pg.costosDevoluciones +
    pg.costoFullfillment;
  pg.comisionPasarela = op.pctPasarela * pg.ingresosTotales * op.comisionPasarela;
  pg.totalCostos = pg.costosIntermediacion + pg.comisionPasarela;
  pg.inversionPublicidad = e.inversion;
  pg.profitBruto = pg.ingresosReales - pg.totalCostos - pg.inversionPublicidad;
  pg.gastosFijos = op.gastosAdminMes;
  pg.profitNeto = pg.profitBruto - pg.gastosFijos;

  pg.margenBruto = pg.ingresosReales ? pg.profitBruto / pg.ingresosReales : 0;
  pg.margenNeto = pg.ingresosReales ? pg.profitNeto / pg.ingresosReales : 0;
  pg.roiAds = pg.inversionPublicidad ? pg.profitNeto / pg.inversionPublicidad : 0;
  pg.conversionReal =
    input.funnel === "leads"
      ? e.visualizaciones ? e.entregas / e.visualizaciones : 0
      : e.cantidadMensajes ? e.entregas / e.cantidadMensajes : 0;
  pg.aovReal = e.entregas ? pg.ingresosTotales / e.entregas : 0;
  const profitMasInv = pg.profitNeto + e.inversion;
  pg.cpaMaximo =
    input.funnel === "leads"
      ? e.ventas ? profitMasInv / e.ventas : 0
      : e.entregas ? profitMasInv / e.entregas : 0;
  pg.roasMinimo = profitMasInv ? pg.ingresosReales / profitMasInv : 0;
  pg.capitalMinimo =
    (pg.costoProductoPrincipal + pg.costoProductoOferta + pg.costosEnvio + e.inversion) /
    (input.funnel === "leads" ? 2 : 4);

  // métricas del embudo que dependen del P&G
  e.cpaFacebook = e.ventas ? e.inversion / e.ventas : 0;
  e.cpaReal = e.entregas ? e.inversion / e.entregas : 0;
  e.roasFacebook = e.inversion ? (e.ventas * op.precioVenta) / e.inversion : 0;
  e.roasReal = e.inversion ? pg.ingresosTotales / e.inversion : 0;

  return {
    embudo: e,
    ofertas: { ventasCantidad, costosCantidad, ventasUpsell, costosUpsell },
    pg,
  };
}

// Asistente de precio (hoja ESTABLECIENDO PRECIOS): precio sugerido desde costos directos
// + el costo de adquisición por venta (CPA, lo que en la hoja era "costo por compra estimado"),
// aplicando el margen y redondeando a un precio "charm" terminado en 9 (como los del modelo).
// margen en 0..1 (<1). cpaPorVenta = costo de publicidad por venta entregada.
export function precioSugerido(
  op: Pick<OperacionInputs, "costoProducto" | "flete" | "fullfillment">,
  margen: number,
  cpaPorVenta = 0,
): number {
  const base = op.costoProducto + op.flete + op.fullfillment + cpaPorVenta;
  if (margen >= 1) return Infinity;
  const raw = base / (1 - margen);
  return Math.ceil(raw / 10) * 10 - 1; // termina en 9 (149, 119…) como el modelo original
}
