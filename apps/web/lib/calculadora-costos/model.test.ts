import { describe, it, expect } from "vitest";
import { calcular, calcularPrecio, type CalcInputs, type PrecioInputs } from "./model";

// Inputs y outputs tomados literalmente de las hojas del archivo fuente.
const leads: CalcInputs = {
  funnel: "leads",
  operacion: { precioVenta: 149, costoProducto: 40, flete: 16, fullfillment: 5, pctPasarela: 0, comisionPasarela: 0, gastosAdminMes: 5000 },
  embudoLeads: { inversion: 30000, cpm: 14.86, ctr: 0.0586, velocidadCarga: 0.8, conversionRate: 0.015, pctConfirmacion: 0.6, pctRechazo: 0.3 },
  cantidad: [
    { pctCompra: 0.6, precio: 149, costo: 48 },
    { pctCompra: 0, precio: 289, costo: 96 },
    { pctCompra: 0.4, precio: 299, costo: 144 },
  ],
  upsells: [
    { pctCompra: 0.3, precio: 25, costo: 10 },
    { pctCompra: 0, precio: 39, costo: 16 },
  ],
};

const mensajes: CalcInputs = {
  funnel: "mensajes",
  operacion: { precioVenta: 89, costoProducto: 18, flete: 0, fullfillment: 5, pctPasarela: 0, comisionPasarela: 0, gastosAdminMes: 10000 },
  embudoMensajes: { inversion: 20000, costoPorMensaje: 2.2, tasaCierre: 0.05, pctRechazo: 0.1 },
  cantidad: [
    { pctCompra: 0.7, precio: 119, costo: 18 },
    { pctCompra: 0, precio: 169, costo: 36 },
    { pctCompra: 0.3, precio: 199, costo: 54 },
  ],
  upsells: [
    { pctCompra: 0.3, precio: 29, costo: 12 },
    { pctCompra: 0, precio: 35, costo: 7 },
  ],
};

describe("calcular — LEADS (vs hoja ANALISIS FINANCIERO - LEADS)", () => {
  const r = calcular(leads);
  it("embudo", () => {
    expect(r.embudo.impresiones).toBe(2018843);
    expect(r.embudo.clics).toBe(118304);
    expect(r.embudo.visualizaciones).toBe(94643);
    expect(r.embudo.ventas).toBe(1420);
    expect(r.embudo.pedidosEnviados).toBe(852);
    expect(r.embudo.devoluciones).toBe(256);
    expect(r.embudo.entregas).toBe(596);
  });
  it("ofertas", () => {
    expect(r.ofertas.ventasCantidad).toBeCloseTo(124564, 1);
    expect(r.ofertas.costosCantidad).toBeCloseTo(51494.4, 1);
    expect(r.ofertas.ventasUpsell).toBeCloseTo(4470, 1);
    expect(r.ofertas.costosUpsell).toBeCloseTo(1788, 1);
  });
  it("P&G", () => {
    expect(r.pg.ingresosTotales).toBeCloseTo(129034, 1);
    expect(r.pg.costosIntermediacion).toBeCloseTo(71942.4, 1);
    expect(r.pg.profitBruto).toBeCloseTo(27091.6, 1);
    expect(r.pg.profitNeto).toBeCloseTo(22091.6, 1);
    expect(r.pg.margenNeto).toBeCloseTo(0.1712, 3);
    expect(r.pg.roiAds).toBeCloseTo(0.7364, 3);
    expect(r.pg.capitalMinimo).toBeCloseTo(48457.2, 1);
  });
});

describe("calcular — MENSAJES (vs hoja ANALISIS FINANCIERO - MENSAJES)", () => {
  const r = calcular(mensajes);
  it("embudo", () => {
    expect(r.embudo.ventas).toBe(455);
    expect(r.embudo.pedidosEnviados).toBe(455);
    expect(r.embudo.devoluciones).toBe(46);
    expect(r.embudo.entregas).toBe(409);
  });
  it("ofertas + P&G", () => {
    expect(r.ofertas.ventasCantidad).toBeCloseTo(58487, 1);
    expect(r.ofertas.costosCantidad).toBeCloseTo(11779.2, 1);
    expect(r.pg.ingresosTotales).toBeCloseTo(62045.3, 1);
    expect(r.pg.costosIntermediacion).toBeCloseTo(15296.6, 1);
    expect(r.pg.profitBruto).toBeCloseTo(26748.7, 1);
    expect(r.pg.profitNeto).toBeCloseTo(16748.7, 1);
    expect(r.pg.capitalMinimo).toBeCloseTo(8312.9, 1);
  });
});

describe("cpaMaximo = N30 (sobre entregas, la misma base que cpaReal)", () => {
  it("LEADS: (profitNeto + inversión) / entregas", () => {
    const r = calcular(leads);
    expect(r.pg.cpaMaximo).toBeCloseTo(87.402, 3); // (22091.6+30000)/596
    expect(r.pg.cpaMaximo).toBeGreaterThan(r.embudo.cpaReal); // 87.40 > 50.34: la campaña está en verde
  });
  it("MENSAJES: igual fórmula", () => {
    expect(calcular(mensajes).pg.cpaMaximo).toBeCloseTo(89.85, 2); // (16748.7+20000)/409
  });
});

describe("los %compra NO se normalizan (el Excel tampoco)", () => {
  it("un reparto que suma 0.9 factura 0.9, no 1.0", () => {
    const r = calcular({ ...leads, cantidad: [
      { pctCompra: 0.6, precio: 149, costo: 48 },
      { pctCompra: 0, precio: 289, costo: 96 },
      { pctCompra: 0.3, precio: 299, costo: 144 },
    ] });
    // 596 entregas → 0.6*149 + 0.3*299 = 106743.6 (no los 118604 que daba al reescalar)
    expect(r.ofertas.ventasCantidad).toBeCloseTo(106743.6, 1);
  });
});

/* ─── Todo lo que el maestro trae cacheado y antes no se verificaba ─── */

describe("LEADS — métricas intermedias (columna I/J)", () => {
  const r = calcular({ ...leads, ventasDeseadas: 1000, velocidad: { clics: 667, visitantes: 600, compras: 6 } });
  it("costos por etapa del embudo", () => {
    expect(r.embudo.costoPorImpresion).toBeCloseTo(0.014859, 5); // J7
    expect(r.embudo.costoPorClic).toBeCloseTo(0.253584, 5); // J10
    expect(r.embudo.costoPorVisualizacion).toBeCloseTo(0.316981, 5); // J13
    expect(r.embudo.cpaFacebook).toBeCloseTo(21.126761, 5); // J16
    expect(r.embudo.costoPorPedidoEnviado).toBeCloseTo(35.211268, 5); // J19
    expect(r.embudo.cpaReal).toBeCloseTo(50.335570, 5); // J24
  });
  it("ingresos y ROAS", () => {
    expect(r.embudo.ingresosSinOfertas).toBeCloseTo(88804, 1); // J23
    expect(r.embudo.roasFacebook).toBeCloseTo(7.052667, 5); // J25
    expect(r.embudo.roasReal).toBeCloseTo(4.301133, 5); // J26
  });
  it("inversión mínima y velocidad medida", () => {
    expect(r.embudo.costoPorVenta).toBeCloseTo(50.335570, 5); // J29
    expect(r.embudo.inversionMinima).toBeCloseTo(50335.570470, 4); // J31 = J29*1000
    expect(r.embudo.velocidadMedida).toBeCloseTo(0.899550, 5); // J38 = 600/667
  });
});

describe("LEADS — P&G completo (columna M/N)", () => {
  const r = calcular(leads);
  it("N4 valúa las ofertas sobre VENTAS, no sobre entregas", () => {
    expect(r.pg.ventasTiendaWeb).toBeCloseTo(307430, 1); // N4
    expect(r.pg.facturadoPrincipal).toBeCloseTo(124564, 1); // N5 — la misma oferta sobre entregas
  });
  it("costos línea por línea", () => {
    expect(r.pg.costosEnvio).toBeCloseTo(13632, 1); // N12 = 852*16
    expect(r.pg.costosDevoluciones).toBeCloseTo(2048, 1); // N13 = 256*16/2
    expect(r.pg.costoFullfillment).toBeCloseTo(2980, 1); // N14 = 5*596
    expect(r.pg.totalCostos).toBeCloseTo(71942.4, 1); // N17
  });
  it("márgenes y topes", () => {
    expect(r.pg.margenBruto).toBeCloseTo(0.209957, 5); // N23
    expect(r.pg.conversionReal).toBeCloseTo(0.0062973, 6); // N26
    expect(r.pg.aovReal).toBeCloseTo(216.5, 2); // N27
    expect(r.pg.cpaMaximoFacebook).toBeCloseTo(36.684225, 5); // N28
    expect(r.pg.cpaMaximoFacebookUsd).toBeCloseTo(10.633109, 5); // O28
    expect(r.pg.roasMinimoFacebook).toBeCloseTo(5.901719, 5); // N29 — sobre N4
    expect(r.pg.roasMinimo).toBeCloseTo(2.477060, 5); // N31
  });
  it("gastos administrativos", () => {
    expect(r.gastos.totalMes).toBe(5000); // C15
    expect(r.gastos.totalDia).toBeCloseTo(166.666667, 5); // C16
  });
  it("ganancia por tier de oferta", () => {
    expect(r.ofertas.gananciaCantidad[0]).toBeCloseTo(36117.6, 1); // C26
    expect(r.ofertas.gananciaCantidad[2]).toBeCloseTo(36952, 1); // E26
    expect(r.ofertas.gananciaOfertaCantidad).toBeCloseTo(73069.6, 1); // C29
    expect(r.ofertas.gananciaUpsell[0]).toBeCloseTo(2682, 1); // C38
    expect(r.ofertas.gananciaOfertaUpsell).toBeCloseTo(2682, 1); // C41
  });
});

describe("MENSAJES — lo que difiere de leads", () => {
  const r = calcular({ ...mensajes, ventasDeseadas: 100 });
  it("el embudo arranca en mensajes, no en impresiones", () => {
    expect(r.embudo.cantidadMensajes).toBeCloseTo(9090.909091, 5); // J6
    expect(r.embudo.cpaFacebook).toBeCloseTo(43.956044, 5); // J9
    expect(r.embudo.cpaReal).toBeCloseTo(48.899756, 5); // J16
    expect(r.embudo.ingresosSinOfertas).toBeCloseTo(36401, 1); // J15
    expect(r.embudo.roasFacebook).toBeCloseTo(2.02475, 5); // J17
    expect(r.embudo.roasReal).toBeCloseTo(3.102265, 5); // J18
    expect(r.embudo.inversionMinima).toBeCloseTo(4889.975550, 4); // J23
  });
  it("la devolución cuesta el flete ENTERO (en leads es la mitad)", () => {
    const conFlete = calcular({ ...mensajes, operacion: { ...mensajes.operacion, flete: 10 } });
    expect(conFlete.pg.costosDevoluciones).toBeCloseTo(460, 1); // 46*10, sin dividir
  });
  it("márgenes y topes — sin las líneas de Facebook", () => {
    expect(r.pg.margenBruto).toBeCloseTo(0.431116, 5); // N23
    expect(r.pg.conversionReal).toBeCloseTo(0.04499, 5); // N26
    expect(r.pg.aovReal).toBeCloseTo(151.7, 2); // N27
    expect(r.pg.cpaMaximo).toBeCloseTo(89.850122, 5); // N28
    expect(r.pg.roasMinimo).toBeCloseTo(1.688367, 5); // N29
    expect(r.pg.ventasTiendaWeb).toBeUndefined(); // la hoja de mensajes no tiene esa fila
    expect(r.pg.roasMinimoFacebook).toBeUndefined();
  });
});

/* ─── Hoja 2 — ESTABLECIENDO PRECIOS ─── */

const precio: PrecioInputs = {
  costoMercancia: 40, flete: 13, costoCompra: 35, fullfillment: 4,
  igv: 0, pctPasarela: 0, tasaPasarela: 0, cuatroXMil: 0.00004,
  margenEsperado: 0.35, precioManual: 99,
};

describe("calcularPrecio (vs hoja ESTABLECIENDO PRECIOS)", () => {
  const r = calcularPrecio(precio);
  it("precio mínimo estimado y costeo", () => {
    expect(r.precioMinimo).toBeCloseTo(141.538462, 5); // B17 = 92/(1-0.35)
    expect(r.costeo.costoIntermediacion).toBeCloseTo(92, 5); // E9
    expect(r.costeo.costosFinancieros).toBeCloseTo(0.005662, 6); // E12 = B17*B12
    expect(r.costeo.totalCostos).toBeCloseTo(92.005662, 5); // E13
    expect(r.costeo.utilidad).toBeCloseTo(49.5328, 4); // E16
    expect(r.costeo.pctIngreso).toBeCloseTo(0.34996, 5); // E17
  });
  it("columna del precio manual", () => {
    expect(r.manual.costoIntermediacion).toBeCloseTo(92, 5); // H7
    expect(r.manual.costosFinancieros).toBeCloseTo(0.00396, 6); // H11 = H6*B12
    expect(r.manual.totalCostos).toBeCloseTo(92.00396, 5); // H12
    expect(r.manual.utilidad).toBeCloseTo(6.99604, 5); // H16
    expect(r.manual.pctIngreso).toBeCloseTo(0.070667, 5); // H17
  });
  it("la comisión de pasarela sale de precio × % × tasa", () => {
    const conPasarela = calcularPrecio({ ...precio, pctPasarela: 0.5, tasaPasarela: 0.04 });
    expect(conPasarela.manual.comisionPasarela).toBeCloseTo(99 * 0.5 * 0.04, 5); // H10
    // el % de pasarela NO se suma como si fuera soles al total (ver nota en model.ts)
    expect(conPasarela.manual.totalCostos).toBeCloseTo(92 + 1.98 + 0.00396, 5);
  });
  it("un margen de 100% no devuelve un precio finito", () => {
    expect(calcularPrecio({ ...precio, margenEsperado: 1 }).precioMinimo).toBe(Infinity);
  });
});
