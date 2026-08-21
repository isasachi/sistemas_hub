import { describe, it, expect } from "vitest";
import { esPrecio, snapshotDe, tituloDe, type StoredInputs } from "./stored";
import type { CalcInputs } from "./model";

const renta: CalcInputs = {
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

const precio: StoredInputs = {
  kind: "precio",
  costoMercancia: 40, flete: 13, costoCompra: 35, fullfillment: 4,
  igv: 0, pctPasarela: 0, tasaPasarela: 0, cuatroXMil: 0.00004,
  margenEsperado: 0.35, precioManual: 99,
};

describe("discriminador de sesiones guardadas", () => {
  it("una sesión LEGADA (sin `kind`) se lee como rentabilidad, no como dato faltante", () => {
    // Es la forma exacta con la que quedaron guardadas todas las sesiones anteriores.
    const legada = renta as StoredInputs;
    expect(esPrecio(legada)).toBe(false);
    const s = snapshotDe(legada);
    expect(s.kind).toBe("rentabilidad");
    expect(tituloDe(s)).toBe("Por leads · S/ 149");
  });

  it("una sesión de precio no finge tener P&G", () => {
    expect(esPrecio(precio)).toBe(true);
    const s = snapshotDe(precio);
    expect(s.kind).toBe("precio");
    if (s.kind !== "precio") throw new Error("kind");
    expect(s.precioMinimo).toBeCloseTo(141.538, 3);
    expect(s.utilidadManual).toBeCloseTo(6.996, 3);
    // Sin la rama, el listado leería `profitNeto`/`funnel` de un objeto que no los tiene.
    expect((s as Record<string, unknown>).profitNeto).toBeUndefined();
    expect(tituloDe(s)).toBe("Precio · S/ 142");
  });

  it("un precio mínimo infinito (margen 100%) no rompe el título del historial", () => {
    const s = snapshotDe({ ...precio, margenEsperado: 1 } as StoredInputs);
    expect(tituloDe(s)).toBe("Precio · S/ 0");
  });

  it("el snapshot de rentabilidad conserva los KPIs que pinta la card", () => {
    const s = snapshotDe({ ...renta, kind: "rentabilidad" });
    if (s.kind === "precio") throw new Error("kind");
    expect(s.profitNeto).toBeCloseTo(22091.6, 1);
    expect(s.margenNeto).toBeCloseTo(0.1712, 3);
    expect(s.roiAds).toBeCloseTo(0.7364, 3);
  });
});
