// Exporta un .xlsx IDÉNTICO al archivo fuente: carga el template, parchea solo las
// celdas de input con los valores del wizard (preservando estilos y fórmulas), borra
// la hoja del embudo no usado, y fuerza recálculo al abrir. JSZip = read-modify-write del zip.
import JSZip from "jszip";
import { normalizarPct, type CalcInputs } from "./model";

// LEADS → sheet3.xml (rId3) · MENSAJES → sheet4.xml (rId4). Hoja1=1, ESTABLECIENDO PRECIOS=2.
const SHEET = {
  leads: { file: "sheet3.xml", rId: "rId3", name: "ANALISIS FINANCIERO - LEADS" },
  mensajes: { file: "sheet4.xml", rId: "rId4", name: "ANALISIS FINANCIERO - MENSAJES" },
};

// Reemplaza el valor numérico de una celda por su ref, preservando atributos (estilo `s=`)
// y descartando `<f>` (fórmula) y `t=` (tipo). Maneja celdas vacías `<c .../>` y con contenido.
function setCell(xml: string, ref: string, value: number): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  return xml.replace(re, (_m, attrs: string) => {
    const clean = attrs.replace(/\s+t="[^"]*"/, "");
    return `<c r="${ref}"${clean}><v>${value}</v></c>`;
  });
}

// Mapa celda→valor para la hoja del funnel elegido. Los % de cantidad se escriben
// NORMALIZADOS para que la hoja calcule lo mismo que la pantalla; los upsells van crudos.
function cellMap(input: CalcInputs): Record<string, number> {
  const op = input.operacion;
  const cant = normalizarPct(input.cantidad);
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
    Object.assign(m, { J4: f.inversion, J5: f.cpm, J8: f.ctr, J11: f.velocidadCarga, J14: f.conversionRate, J17: f.pctConfirmacion, J20: f.pctRechazo });
  } else {
    const f = input.embudoMensajes!;
    Object.assign(m, { J4: f.inversion, J5: f.costoPorMensaje, J7: f.tasaCierre, J12: f.pctRechazo });
  }
  return m;
}

export async function exportarXlsx(input: CalcInputs): Promise<void> {
  const res = await fetch("/calculadora-costos/template.xlsx");
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  const keep = SHEET[input.funnel];
  const drop = SHEET[input.funnel === "leads" ? "mensajes" : "leads"];

  // 1) Parchear las celdas de input en la hoja del funnel elegido.
  let sheetXml = await zip.file(`xl/worksheets/${keep.file}`)!.async("string");
  const map = cellMap(input);
  for (const [ref, val] of Object.entries(map)) sheetXml = setCell(sheetXml, ref, val);
  zip.file(`xl/worksheets/${keep.file}`, sheetXml);

  // 2) Borrar la hoja del embudo no usado (archivo + entrada + relación).
  zip.remove(`xl/worksheets/${drop.file}`);
  let wb = await zip.file("xl/workbook.xml")!.async("string");
  wb = wb.replace(new RegExp(`<sheet [^>]*r:id="${drop.rId}"/>`), "");
  wb = wb.replace(/<calcPr [^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>'); // 3) forzar recálculo
  wb = wb.replace(/<extLst>[\s\S]*?<\/extLst>/, ""); // quitar metadata de Google (checksum dejaría de cuadrar)
  zip.file("xl/workbook.xml", wb);

  let rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  rels = rels.replace(new RegExp(`<Relationship Id="${drop.rId}"[^>]*/>`), "");
  // 4) Borrar calcChain (referencia celdas de la hoja borrada; los apps lo reconstruyen).
  zip.remove("xl/calcChain.xml");
  rels = rels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, "");
  zip.file("xl/_rels/workbook.xml.rels", rels);

  let ct = await zip.file("[Content_Types].xml")!.async("string");
  ct = ct.replace(new RegExp(`<Override PartName="/xl/worksheets/${drop.file}"[^>]*/>`), "");
  ct = ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, "");
  zip.file("[Content_Types].xml", ct);

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "analisis-financiero-ecom.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
