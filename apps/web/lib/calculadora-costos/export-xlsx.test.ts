import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { exportarXlsx, exportarXlsxPrecio } from "./export-xlsx";
import type { CalcInputs, PrecioInputs } from "./model";

/**
 * El export es cirugía de regex sobre el zip del template real: parchea celdas, borra
 * hojas y arregla workbook.xml / rels / [Content_Types]. Nada de eso lo ve el typechecker,
 * y si una hoja queda referenciada tras borrarla Excel abre el archivo como CORRUPTO.
 * Este test corre la función de verdad contra el template de verdad y vuelve a abrir el
 * resultado con JSZip para comprobarlo.
 */

const TEMPLATE = join(process.cwd(), "public/calculadora-costos/template.xlsx");
let ultimoBlob: Blob | null = null;

beforeAll(() => {
  const bytes = readFileSync(TEMPLATE);
  vi.stubGlobal("fetch", async () => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }));
  vi.stubGlobal("URL", { createObjectURL: (b: Blob) => { ultimoBlob = b; return "blob:x"; }, revokeObjectURL: () => {} });
  vi.stubGlobal("document", { createElement: () => ({ click: () => {}, set href(_v: string) {}, set download(_v: string) {} }) });
});

async function generado() {
  const zip = await JSZip.loadAsync(await ultimoBlob!.arrayBuffer());
  const leer = async (p: string) => (zip.file(p) ? zip.file(p)!.async("string") : null);
  return { zip, leer };
}

const leads: CalcInputs = {
  funnel: "leads",
  operacion: { precioVenta: 199, costoProducto: 40, flete: 16, fullfillment: 5, pctPasarela: 0, comisionPasarela: 0, gastosAdminMes: 5000 },
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
  ventasDeseadas: 1234,
};

const precio: PrecioInputs = {
  costoMercancia: 40, flete: 13, costoCompra: 35, fullfillment: 4,
  igv: 0.18, pctPasarela: 0, tasaPasarela: 0, cuatroXMil: 0.00004,
  margenEsperado: 0.42, precioManual: 177,
};

describe("exportarXlsx (rentabilidad)", () => {
  it("conserva la hoja del funnel, borra la otra y deja el libro consistente", async () => {
    await exportarXlsx(leads);
    const { zip, leer } = await generado();

    // LEADS = sheet3 (rId3) se conserva; MENSAJES = sheet4 (rId4) se va entera.
    expect(zip.file("xl/worksheets/sheet3.xml")).not.toBeNull();
    expect(zip.file("xl/worksheets/sheet4.xml")).toBeNull();

    const wb = (await leer("xl/workbook.xml"))!;
    const rels = (await leer("xl/_rels/workbook.xml.rels"))!;
    const ct = (await leer("[Content_Types].xml"))!;
    // Una referencia colgante a la hoja borrada = archivo corrupto al abrirlo.
    expect(wb).not.toContain('r:id="rId4"');
    expect(rels).not.toContain('Id="rId4"');
    expect(ct).not.toContain("sheet4.xml");
    expect(wb).toContain('r:id="rId3"');
    // calcChain apunta a celdas de la hoja borrada: se elimina de las tres partes.
    expect(zip.file("xl/calcChain.xml")).toBeNull();
    expect(rels).not.toContain("calcChain");
    expect(ct).not.toContain("calcChain");
    // Sin esto Excel muestra los valores cacheados del maestro, no los del usuario.
    expect(wb).toContain('fullCalcOnLoad="1"');
  });

  it("escribe los valores del usuario en sus celdas, sin dejar la fórmula vieja", async () => {
    await exportarXlsx(leads);
    const { leer } = await generado();
    const s = (await leer("xl/worksheets/sheet3.xml"))!;
    const celda = (ref: string) => s.match(new RegExp(`<c r="${ref}"[^>]*>(?:<v>([^<]*)</v>)?`))?.[1];
    expect(celda("C4")).toBe("199"); // precio de venta
    expect(celda("C15")).toBe("5000"); // gastos admin
    expect(celda("J30")).toBe("1234"); // ventas deseadas
    expect(celda("E24")).toBe("299"); // precio de la oferta 3
    // D25 tenía `=C25*2` en el maestro: al parchearlo la fórmula debe desaparecer.
    expect(s).toMatch(/<c r="D25"[^>]*><v>96<\/v><\/c>/);
  });
});

describe("exportarXlsxPrecio", () => {
  it("conserva ESTABLECIENDO PRECIOS y borra las DOS hojas de análisis", async () => {
    await exportarXlsxPrecio(precio);
    const { zip, leer } = await generado();
    expect(zip.file("xl/worksheets/sheet2.xml")).not.toBeNull();
    expect(zip.file("xl/worksheets/sheet3.xml")).toBeNull();
    expect(zip.file("xl/worksheets/sheet4.xml")).toBeNull();

    const wb = (await leer("xl/workbook.xml"))!;
    const rels = (await leer("xl/_rels/workbook.xml.rels"))!;
    expect(wb).toContain('r:id="rId2"');
    for (const id of ['r:id="rId3"', 'r:id="rId4"']) expect(wb).not.toContain(id);
    for (const id of ['Id="rId3"', 'Id="rId4"']) expect(rels).not.toContain(id);

    const s = (await leer("xl/worksheets/sheet2.xml"))!;
    const celda = (ref: string) => s.match(new RegExp(`<c r="${ref}"[^>]*>(?:<v>([^<]*)</v>)?`))?.[1];
    expect(celda("B5")).toBe("40");
    expect(celda("B9")).toBe("0.18"); // IGV: se guarda aunque la hoja no lo consuma
    expect(celda("B16")).toBe("0.42"); // margen esperado
    expect(celda("H6")).toBe("177"); // precio manual
  });
});
