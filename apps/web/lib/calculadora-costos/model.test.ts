import { describe, it, expect } from "vitest";
import { calcular, normalizarPct, type CalcInputs } from "./model";

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

describe("normalizarPct", () => {
  it("reescala a 100% manteniendo proporciones", () => {
    const out = normalizarPct([{ pctCompra: 0.6 }, { pctCompra: 0.3 }]); // suma 0.9
    expect(out[0].pctCompra).toBeCloseTo(2 / 3, 5);
    expect(out[1].pctCompra).toBeCloseTo(1 / 3, 5);
  });
  it("todo cero queda en cero", () => {
    const out = normalizarPct([{ pctCompra: 0 }, { pctCompra: 0 }]);
    expect(out[0].pctCompra).toBe(0);
  });
});
