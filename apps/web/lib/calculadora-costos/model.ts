// Modelo financiero e-com — transcripción de las tres hojas del archivo maestro
// "ANALISIS FINANCIEROS- ACADEMY ECOM.xlsx". Puro, sin deps.
//
//   ESTABLECIENDO PRECIOS      → calcularPrecio()   (hoja 2)
//   ANALISIS FINANCIERO-LEADS  → calcular()         (hoja 3, funnel "leads")
//   ANALISIS FINANCIERO-MENSAJ → calcular()         (hoja 4, funnel "mensajes")
//
// Cada campo lleva su celda del maestro como comentario. `model.test.ts` fija los
// valores que el propio archivo trae cacheados: si una fórmula se desvía, falla ahí.

export type Funnel = "leads" | "mensajes";

/* ───────────────────────── helpers de Excel ───────────────────────── */

// Excel ROUND: redondeo half-away-from-zero (no el banker's de JS).
function round(n: number, digits = 0): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return (Math.sign(n) * Math.round(Math.abs(n) * f)) / f;
}
// Excel ROUNDUP / ROUNDDOWN: se alejan / acercan al cero (no floor/ceil con negativos).
const roundUp = (n: number) => (Number.isFinite(n) ? Math.sign(n) * Math.ceil(Math.abs(n)) : 0);
const roundDown = (n: number) => (Number.isFinite(n) ? Math.trunc(n) : 0);
// Excel IFERROR(x/y, 0) — el maestro envuelve así toda división que puede dar #DIV/0!.
const div = (a: number, b: number) => (b && Number.isFinite(a / b) ? a / b : 0);

/* ═══════════════════ HOJA 2 — ESTABLECIENDO PRECIOS ═══════════════════ */

export interface PrecioInputs {
  costoMercancia: number; // B5  Costo de la Mercancía Vendida
  flete: number; // B6  Flete de Envío
  costoCompra: number; // B7  Costo por Compra Estimado (lo que te cuesta traer al comprador)
  fullfillment: number; // B8  Costo del Fullfillment
  igv: number; // B9  IGV — ver nota abajo
  pctPasarela: number; // B10 % de Compras en Pasarelas (0..1)
  tasaPasarela: number; // B11 Tasa Comisión de Pasarela de Pago (0..1)
  cuatroXMil: number; // B12 4x1000
  margenEsperado: number; // B16 Margen de Ganancia Esperado (0..1)
  precioManual: number; // H6  Precio de Venta Manual
}

// ponytail: el IGV (B9) es una fila de entrada que NINGUNA fórmula del maestro consume
// —E9 suma solo E5:E8—. Se guarda y se muestra igual que en la hoja; no se le inventa un uso.

export interface PrecioColumna {
  costoIntermediacion: number;
  pctPasarela: number;
  comisionPasarela: number;
  costosFinancieros: number;
  totalCostos: number;
  utilidad: number;
  pctIngreso: number;
}

export interface PrecioResult {
  /** B17 — Precio de Venta Mínimo Estimado */
  precioMinimo: number;
  /** Columna central: el costeo sobre el precio mínimo estimado. */
  costeo: PrecioColumna;
  /** Columna derecha: el mismo costeo sobre el precio que el usuario fija a mano. */
  manual: PrecioColumna;
}

export function calcularPrecio(i: PrecioInputs): PrecioResult {
  // E9 = SUM(E5:E8) — mercancía + flete + costo por compra + fullfillment.
  const costoIntermediacion = i.costoMercancia + i.flete + i.costoCompra + i.fullfillment;
  // B17 = E9/(1-B16)
  const precioMinimo = i.margenEsperado >= 1 ? Infinity : div(costoIntermediacion, 1 - i.margenEsperado);

  // ponytail: el maestro escribe E13 = E9+SUM(E10:E12) y H12 = H7+SUM(H8:H11), o sea suma
  // las filas de PORCENTAJE (% de compras, tasa de comisión) dentro de un total en soles.
  // Con los valores del maestro esas celdas son 0 y el resultado es idéntico; acá se suman
  // solo los costos reales para que subir el % de pasarela no sume "0.30 soles" al total.
  const columna = (precio: number, pctPas: number, tasaPas: number): PrecioColumna => {
    const comisionPasarela = precio * pctPas * tasaPas; // H10 = H6*H8*H9 · E11 = E10*B11
    const costosFinancieros = precio * i.cuatroXMil; // E12 = B17*B12 · H11 = H6*B12
    const totalCostos = costoIntermediacion + comisionPasarela + costosFinancieros;
    const utilidad = precio - totalCostos; // E16 = B17-E13 · H16 = H6-H12
    return {
      costoIntermediacion,
      pctPasarela: pctPas,
      comisionPasarela,
      costosFinancieros,
      totalCostos,
      utilidad,
      pctIngreso: div(utilidad, precio), // E17 / H17
    };
  };

  return {
    precioMinimo,
    // E11 = E10*B11: la comisión de la columna central sale del % de la hoja, no del precio.
    // Se expresa igual que la manual (precio × % × tasa) porque con B10=0 coinciden y así
    // las dos columnas se leen con la misma fórmula.
    costeo: columna(precioMinimo, i.pctPasarela, i.tasaPasarela),
    manual: columna(i.precioManual, i.pctPasarela, i.tasaPasarela),
  };
}

/* ═════════════ HOJAS 3 y 4 — ANALISIS FINANCIERO (leads / mensajes) ═════════════ */

export interface OperacionInputs {
  precioVenta: number; // C4
  costoProducto: number; // C5
  flete: number; // C6
  fullfillment: number; // C7
  pctPasarela: number; // C8  (0..1)
  comisionPasarela: number; // C9  (0..1)
  gastosAdminMes: number; // C15 Total Gastos Admin/Mes
}

export interface EmbudoLeadsInputs {
  inversion: number; // J4
  cpm: number; // J5
  ctr: number; // J8  (0..1)
  velocidadCarga: number; // J11 (0..1)
  conversionRate: number; // J14 (0..1)
  pctConfirmacion: number; // J17 (0..1)
  pctRechazo: number; // J20 (0..1)
}

export interface EmbudoMensajesInputs {
  inversion: number; // J4
  costoPorMensaje: number; // J5
  tasaCierre: number; // J7  (0..1)
  pctRechazo: number; // J12 (0..1)
}

export interface OfertaTier {
  pctCompra: number; // C22..E22 / C34..D34 (0..1)
  precio: number; // C24..E24 / C36..D36
  costo: number; // C25..E25 / C37..D37
}

/** Calculadora suelta del pie de la hoja de métricas (J34:J38). No alimenta nada más. */
export interface VelocidadInputs {
  clics: number; // J34
  visitantes: number; // J35
  compras: number; // J36
}

export interface CalcInputs {
  funnel: Funnel;
  operacion: OperacionInputs;
  embudoLeads?: EmbudoLeadsInputs;
  embudoMensajes?: EmbudoMensajesInputs;
  cantidad: [OfertaTier, OfertaTier, OfertaTier]; // los %compra deben sumar 1
  upsells: [OfertaTier, OfertaTier];
  /** J30 / J22 — meta de ventas para la inversión mínima requerida. */
  ventasDeseadas?: number;
  /** N2 — rótulo del período. ponytail: el maestro tampoco lo consume (C16 divide entre 30 fijo). */
  diasAnalisis?: number;
  velocidad?: VelocidadInputs;
}

export interface CalcResult {
  embudo: Record<string, number>;
  ofertas: {
    unidadesCantidad: number[]; // C23:E23
    gananciaCantidad: number[]; // C26:E26
    ventasCantidad: number; // C27
    costosCantidad: number; // C28
    gananciaOfertaCantidad: number; // C29
    unidadesUpsell: number[]; // C35:D35
    gananciaUpsell: number[]; // C38:D38
    ventasUpsell: number; // C39
    costosUpsell: number; // C40
    gananciaOfertaUpsell: number; // C41
  };
  gastos: { equipoGeneral: number; totalMes: number; totalDia: number }; // C14:C16
  pg: Record<string, number>;
}

export function calcular(input: CalcInputs): CalcResult {
  const op = input.operacion;
  const e: Record<string, number> = {};

  /* ── Análisis de Métricas (columna I/J) ── */
  if (input.funnel === "leads") {
    const f = input.embudoLeads!;
    e.inversion = f.inversion; // J4
    e.cpm = f.cpm; // J5
    e.impresiones = round(div(f.inversion, f.cpm) * 1000); // J6
    e.costoPorImpresion = div(f.inversion, e.impresiones); // J7
    e.ctr = f.ctr; // J8
    e.clics = round(e.impresiones * f.ctr); // J9
    e.costoPorClic = div(f.inversion, e.clics); // J10
    e.velocidadCarga = f.velocidadCarga; // J11
    e.visualizaciones = round(e.clics * f.velocidadCarga); // J12
    e.costoPorVisualizacion = div(f.inversion, e.visualizaciones); // J13
    e.conversionRate = f.conversionRate; // J14
    e.ventas = round(e.visualizaciones * f.conversionRate); // J15
    e.cpaFacebook = div(f.inversion, e.ventas); // J16
    e.pctConfirmacion = f.pctConfirmacion; // J17
    e.pedidosEnviados = e.ventas * f.pctConfirmacion; // J18
    e.costoPorPedidoEnviado = div(f.inversion, e.pedidosEnviados); // J19
    e.pctRechazo = f.pctRechazo; // J20
    e.devoluciones = roundUp(f.pctRechazo * e.pedidosEnviados); // J21
    e.entregas = roundDown(e.pedidosEnviados - e.devoluciones); // J22
  } else {
    const f = input.embudoMensajes!;
    e.inversion = f.inversion; // J4
    e.costoPorMensaje = f.costoPorMensaje; // J5
    e.cantidadMensajes = div(f.inversion, f.costoPorMensaje); // J6
    e.tasaCierre = f.tasaCierre; // J7
    e.ventas = round(e.cantidadMensajes * f.tasaCierre); // J8
    e.cpaFacebook = div(f.inversion, e.ventas); // J9
    e.pedidosEnviados = e.ventas; // J10
    e.costoPorPedidoEnviado = div(f.inversion, e.pedidosEnviados); // J11
    e.pctRechazo = f.pctRechazo; // J12
    e.devoluciones = roundUp(f.pctRechazo * e.pedidosEnviados); // J13
    e.entregas = roundDown(e.pedidosEnviados - e.devoluciones); // J14
  }
  e.ingresosSinOfertas = e.entregas * op.precioVenta; // J23 / J15
  e.cpaReal = div(e.inversion, e.entregas); // J24 / J16
  e.roasFacebook = div(e.ventas * op.precioVenta, e.inversion); // J25 / J17

  /* ── Ofertas ── base = entregas efectivas ── */
  // Los %compra entran crudos, como en el maestro (C23=C22*J22 a secas): la nota "deben sumar
  // 100%" es informal, no una fórmula. Reescalarlos inflaría los ingresos cuando no suman 1.
  const cant = input.cantidad;
  const ups = input.upsells;
  const unidadesCantidad = cant.map((t) => t.pctCompra * e.entregas); // C23:E23
  const unidadesUpsell = ups.map((t) => t.pctCompra * e.entregas); // C35:D35
  const gananciaCantidad = cant.map((t, i) => (t.precio - t.costo) * unidadesCantidad[i]); // C26:E26
  const gananciaUpsell = ups.map((t, i) => (t.precio - t.costo) * unidadesUpsell[i]); // C38:D38
  const ventasCantidad = cant.reduce((s, t, i) => s + unidadesCantidad[i] * t.precio, 0); // C27
  const costosCantidad = cant.reduce((s, t, i) => s + unidadesCantidad[i] * t.costo, 0); // C28
  const ventasUpsell = ups.reduce((s, t, i) => s + unidadesUpsell[i] * t.precio, 0); // C39
  const costosUpsell = ups.reduce((s, t, i) => s + unidadesUpsell[i] * t.costo, 0); // C40

  /* ── Gastos administrativos (C14:C16) ── */
  const gastos = {
    equipoGeneral: op.gastosAdminMes, // C14 = C15
    totalMes: op.gastosAdminMes, // C15
    totalDia: op.gastosAdminMes / 30, // C16 = C15/30 (el 30 va fijo en el maestro)
  };

  /* ── P&G (columna M/N) ── */
  const pg: Record<string, number> = {};
  if (input.funnel === "leads") {
    // N4 — "Ventas en Tienda Web (Shopify)": las ofertas valuadas sobre VENTAS (J15), no sobre
    // entregas. Es la única línea con esa base y solo la consume el Roas Mínimo de Facebook.
    pg.ventasTiendaWeb =
      cant.reduce((s, t) => s + e.ventas * t.pctCompra * t.precio, 0) +
      ups.reduce((s, t) => s + e.ventas * t.pctCompra * t.precio, 0);
  }
  pg.facturadoPrincipal = ventasCantidad; // N5 / N4
  pg.facturadoOferta = ventasUpsell; // N6 / N5
  pg.ingresosTotales = pg.facturadoPrincipal + pg.facturadoOferta; // N7 / N6
  pg.ingresosReales = pg.ingresosTotales; // N9 = N7-N8, y N8 (otros) está vacío
  pg.costoProductoPrincipal = costosCantidad; // N10
  pg.costoProductoOferta = costosUpsell; // N11
  pg.costosEnvio = e.pedidosEnviados * op.flete; // N12
  // N13 — en leads la devolución cuesta MEDIO flete (solo la ida se pierde); en mensajes, entero.
  pg.costosDevoluciones =
    input.funnel === "leads" ? (e.devoluciones * op.flete) / 2 : e.devoluciones * op.flete;
  pg.costoFullfillment = op.fullfillment * e.entregas; // N14
  pg.costosIntermediacion =
    pg.costoProductoPrincipal +
    pg.costoProductoOferta +
    pg.costosEnvio +
    pg.costosDevoluciones +
    pg.costoFullfillment; // N15
  pg.comisionPasarela = op.pctPasarela * pg.ingresosTotales * op.comisionPasarela; // N16
  pg.totalCostos = pg.costosIntermediacion + pg.comisionPasarela; // N17
  pg.inversionPublicidad = e.inversion; // N18
  pg.profitBruto = pg.ingresosReales - pg.totalCostos - pg.inversionPublicidad; // N19
  pg.gastosFijos = gastos.equipoGeneral; // N20 = C14
  pg.profitNeto = pg.profitBruto - pg.gastosFijos; // N21

  pg.margenBruto = div(pg.profitBruto, pg.ingresosReales); // N23
  pg.margenNeto = div(pg.profitNeto, pg.ingresosReales); // N24
  pg.roiAds = div(pg.profitNeto, pg.inversionPublicidad); // N25
  pg.conversionReal = div(e.entregas, input.funnel === "leads" ? e.visualizaciones : e.cantidadMensajes); // N26
  pg.aovReal = div(pg.ingresosTotales, e.entregas); // N27

  const profitMasInv = pg.profitNeto + e.inversion;
  if (input.funnel === "leads") {
    pg.cpaMaximoFacebook = div(profitMasInv, e.ventas); // N28
    pg.cpaMaximoFacebookUsd = div(pg.cpaMaximoFacebook, 3.45); // O28 — el mismo tope en dólares
    pg.roasMinimoFacebook = div(pg.ventasTiendaWeb, profitMasInv); // N29 — ojo: sobre N4
  }
  pg.cpaMaximo = div(profitMasInv, e.entregas); // N30 (leads) / N28 (mensajes)
  pg.roasMinimo = div(pg.ingresosReales, profitMasInv); // N31 (leads) / N29 (mensajes)
  // N32 / N30 — el ciclo de caja: quincenal en leads (/2), semanal en mensajes (/4).
  pg.capitalMinimo =
    (pg.costoProductoPrincipal + pg.costoProductoOferta + pg.costosEnvio + e.inversion) /
    (input.funnel === "leads" ? 2 : 4);

  // ROAS Real depende del P&G, por eso cierra acá (J26 / J18).
  e.roasReal = div(pg.ingresosTotales, e.inversion);

  /* ── Inversión mínima requerida (J29:J31 / J21:J23) ── */
  e.costoPorVenta = e.cpaReal;
  e.ventasDeseadas = input.ventasDeseadas ?? 0;
  e.inversionMinima = e.costoPorVenta * e.ventasDeseadas;

  /* ── Calculadora suelta de velocidad de carga (J34:J38) ── */
  if (input.velocidad) {
    e.velClics = input.velocidad.clics;
    e.velVisitantes = input.velocidad.visitantes;
    e.velCompras = input.velocidad.compras;
    e.velocidadMedida = div(input.velocidad.visitantes, input.velocidad.clics); // J38
  }

  return {
    embudo: e,
    ofertas: {
      unidadesCantidad,
      gananciaCantidad,
      ventasCantidad,
      costosCantidad,
      gananciaOfertaCantidad: ventasCantidad - costosCantidad, // C29
      unidadesUpsell,
      gananciaUpsell,
      ventasUpsell,
      costosUpsell,
      gananciaOfertaUpsell: ventasUpsell - costosUpsell, // C41
    },
    gastos,
    pg,
  };
}
