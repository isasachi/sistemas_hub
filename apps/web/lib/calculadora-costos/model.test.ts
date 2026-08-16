import { describe, it, expect } from "vitest";
import { calcular, precioSugerido, type CalcInputs } from "./model";

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

describe("precioSugerido", () => {
  it("reproduce el precio real del modelo (costos 40+13+4 + CPA 35, margen 35% → 149)", () => {
    expect(precioSugerido({ costoProducto: 40, flete: 13, fullfillment: 4 }, 0.35, 35)).toBe(149);
  });
  it("termina en 9 y cubre el CPA", () => {
    const p = precioSugerido({ costoProducto: 40, flete: 16, fullfillment: 5 }, 0.35, 50);
    expect(p % 10).toBe(9);
    expect(p).toBe(179); // (40+16+5+50)/0.65 = 170.8 → charm 179
  });
  it("sin CPA cae al piso de costos directos", () => {
    expect(precioSugerido({ costoProducto: 18, flete: 0, fullfillment: 5 }, 0.35, 0)).toBe(39); // 23/0.65=35.4 → 39
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
