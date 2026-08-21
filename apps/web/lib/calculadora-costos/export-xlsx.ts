// Exporta un .xlsx IDÉNTICO al archivo fuente: carga el template, parchea solo las
// celdas de input con los valores de la hoja (preservando estilos y fórmulas), borra
// las hojas que no se usan, y fuerza recálculo al abrir. JSZip = read-modify-write del zip.
import JSZip from "jszip";
import { type CalcInputs, type PrecioInputs } from "./model";

// Hoja1=sheet1/rId1 (oculta) · ESTABLECIENDO PRECIOS=sheet2/rId2
// ANALISIS FINANCIERO - LEADS=sheet3/rId3 · … MENSAJES=sheet4/rId4
const SHEET = {
  precio: { file: "sheet2.xml", rId: "rId2" },
  leads: { file: "sheet3.xml", rId: "rId3" },
  mensajes: { file: "sheet4.xml", rId: "rId4" },
};

// Reemplaza el valor numérico de una celda por su ref, preservando atributos (estilo `s=`)
// y descartando `<f>` (fórmula) y `t=` (tipo). Maneja celdas vacías `<c .../>` y con contenido.
function setCell(xml: string, ref: string, value: number): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  return xml.replace(re, (_m, attrs: string) => {
    const clean = attrs.replace(/\s+t="[^"]*"/, "");
    return `<c r="${ref}"${clean}><v>${Number.isFinite(value) ? value : 0}</v></c>`;
  });
}

/** Parchea una hoja, borra las otras y descarga el archivo. */
async function construir(
  keep: { file: string; rId: string },
  cells: Record<string, number>,
  drop: { file: string; rId: string }[],
  nombre: string,
): Promise<void> {
  const res = await fetch("/calculadora-costos/template.xlsx");
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  // 1) Parchear las celdas de input en la hoja que se conserva.
  let sheetXml = await zip.file(`xl/worksheets/${keep.file}`)!.async("string");
  for (const [ref, val] of Object.entries(cells)) sheetXml = setCell(sheetXml, ref, val);
  zip.file(`xl/worksheets/${keep.file}`, sheetXml);

  // 2) Borrar las hojas que no se usan (archivo + entrada + relación + content-type).
  let wb = await zip.file("xl/workbook.xml")!.async("string");
  let rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  let ct = await zip.file("[Content_Types].xml")!.async("string");
  for (const d of drop) {
    zip.remove(`xl/worksheets/${d.file}`);
    wb = wb.replace(new RegExp(`<sheet [^>]*r:id="${d.rId}"/>`), "");
    rels = rels.replace(new RegExp(`<Relationship Id="${d.rId}"[^>]*/>`), "");
    ct = ct.replace(new RegExp(`<Override PartName="/xl/worksheets/${d.file}"[^>]*/>`), "");
  }

  wb = wb.replace(/<calcPr [^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>'); // 3) forzar recálculo
  wb = wb.replace(/<extLst>[\s\S]*?<\/extLst>/, ""); // quitar metadata de Google (el checksum dejaría de cuadrar)
  zip.file("xl/workbook.xml", wb);

  // 4) Borrar calcChain (referencia celdas de las hojas borradas; los apps lo reconstruyen).
  zip.remove("xl/calcChain.xml");
  rels = rels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, "");
  ct = ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, "");
  zip.file("xl/_rels/workbook.xml.rels", rels);
  zip.file("[Content_Types].xml", ct);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

// Mapa celda→valor para la hoja del funnel elegido. Los % van crudos, igual que en pantalla:
// la hoja calcula lo mismo porque el Excel tampoco los normaliza.
function cellMap(input: CalcInputs): Record<string, number> {
  const op = input.operacion;
  const cant = input.cantidad;
  const ups = input.upsells;
  const m: Record<string, number> = {
    C4: op.precioVenta, C5: op.costoProducto, C6: op.flete, C7: op.fullfillment,
    C8: op.pctPasarela, C9: op.comisionPasarela, C15: op.gastosAdminMes,
    C22: cant[0].pctCompra, D22: cant[1].pctCompra, E22: cant[2].pctCompra,
    C24: cant[0].precio, D24: cant[1].precio, E24: cant[2].precio,
    C25: cant[0].costo, D25: cant[1].costo, E25: cant[2].costo,
    C34: ups[0].pctCompra, D34: ups[1].pctCompra,
    C36: ups[0].precio, D36: ups[1].precio,
    C37: ups[0].costo, D37: ups[1].costo,
  };
  if (input.funnel === "leads") {
    const f = input.embudoLeads!;
    Object.assign(m, {
      J4: f.inversion, J5: f.cpm, J8: f.ctr, J11: f.velocidadCarga,
      J14: f.conversionRate, J17: f.pctConfirmacion, J20: f.pctRechazo,
      J30: input.ventasDeseadas ?? 0, N2: input.diasAnalisis ?? 30,
      J34: input.velocidad?.clics ?? 0, J35: input.velocidad?.visitantes ?? 0, J36: input.velocidad?.compras ?? 0,
    });
  } else {
    const f = input.embudoMensajes!;
    Object.assign(m, {
      J4: f.inversion, J5: f.costoPorMensaje, J7: f.tasaCierre, J12: f.pctRechazo,
      J22: input.ventasDeseadas ?? 0, N2: input.diasAnalisis ?? 30,
      J34: input.velocidad?.clics ?? 0, J35: input.velocidad?.visitantes ?? 0, J36: input.velocidad?.compras ?? 0,
    });
  }
  return m;
}

export async function exportarXlsx(input: CalcInputs): Promise<void> {
  const keep = SHEET[input.funnel];
  const otro = SHEET[input.funnel === "leads" ? "mensajes" : "leads"];
  await construir(keep, cellMap(input), [otro], "analisis-financiero-ecom.xlsx");
}

export async function exportarXlsxPrecio(input: PrecioInputs): Promise<void> {
  await construir(
    SHEET.precio,
    {
      B5: input.costoMercancia, B6: input.flete, B7: input.costoCompra, B8: input.fullfillment,
      B9: input.igv, B10: input.pctPasarela, B11: input.tasaPasarela, B12: input.cuatroXMil,
      B16: input.margenEsperado, H6: input.precioManual,
    },
    [SHEET.leads, SHEET.mensajes],
    "costeo-de-productos.xlsx",
  );
}
