"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import { SheetBlock, SheetMatrix, type MatrixRow, type SheetRow } from "@/components/tools/calculadora-costos/SheetGrid";
import { calcular, type CalcInputs, type Funnel } from "@/lib/calculadora-costos/model";
import { snapshotDe, type RentaSessionInputs } from "@/lib/calculadora-costos/stored";

/**
 * Hojas "ANALISIS FINANCIERO - LEADS / MENSAJES" en una sola pantalla, sin pasos: las dos
 * son la misma vista con distinto embudo, así que el funnel es un interruptor arriba y no
 * dos páginas. Todo se recalcula con cada tecla; al guardar se pasa al dashboard.
 */

const DEFAULTS: Record<Funnel, CalcInputs> = {
  leads: {
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
    ventasDeseadas: 1000,
    diasAnalisis: 30,
    velocidad: { clics: 667, visitantes: 600, compras: 6 },
  },
  mensajes: {
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
    ventasDeseadas: 100,
    diasAnalisis: 30,
    velocidad: { clics: 667, visitantes: 600, compras: 6 },
  },
};

function HojaRentabilidad() {
  const router = useRouter();
  const params = useSearchParams();
  const sid = params.get("sesion");
  const [f, setF] = useState<CalcInputs>(structuredClone(DEFAULTS.leads));
  const [calcId, setCalcId] = useState<string | null>(sid);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sid) return;
    fetch(`/api/calculadora-costos/sessions/${sid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.inputs && d.inputs.kind !== "precio") setF(d.inputs); })
      .catch(() => {});
  }, [sid]);

  const r = useMemo(() => calcular(f), [f]);
  const { embudo: e, pg, ofertas: o, gastos } = r;
  const leads = f.funnel === "leads";

  // Setter por ruta de campo — el form es un árbol chico y no amerita un reducer.
  function set(path: string, val: number) {
    setF((prev) => {
      const next = structuredClone(prev);
      const parts = path.split(".");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let obj: any = next;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = val;
      return next;
    });
  }
  const on = (path: string) => (n: number) => set(path, n);

  /* ── Columna izquierda ── */
  const operacion: SheetRow[] = [
    { label: "Precio de Venta", value: f.operacion.precioVenta, format: "money", onChange: on("operacion.precioVenta") },
    { label: "Costo del Producto Vendido", value: f.operacion.costoProducto, format: "money", onChange: on("operacion.costoProducto") },
    { label: "Flete de Envío", value: f.operacion.flete, format: "money", onChange: on("operacion.flete") },
    { label: "Costo de FullFillment", value: f.operacion.fullfillment, format: "money", onChange: on("operacion.fullfillment") },
    { label: "% de Compras en Pasarelas", value: f.operacion.pctPasarela, format: "pct", onChange: on("operacion.pctPasarela") },
    { label: "Comisión de Pasarela de Pago", value: f.operacion.comisionPasarela, format: "pct", onChange: on("operacion.comisionPasarela") },
  ];

  const admin: SheetRow[] = [
    { label: "Equipo y gasto en general", value: gastos.equipoGeneral, format: "money", dim: true },
    { label: "Total Gastos Admin/ Mes", value: f.operacion.gastosAdminMes, format: "money", onChange: on("operacion.gastosAdminMes") },
    { label: "Total Gastos Admin/ Dia", value: gastos.totalDia, format: "money", dim: true },
  ];

  const tierCells = (grupo: "cantidad" | "upsells", campo: "pctCompra" | "precio" | "costo") =>
    (grupo === "cantidad" ? f.cantidad : f.upsells).map((t, i) => ({
      value: t[campo],
      onChange: on(`${grupo}.${i}.${campo}`),
    }));

  const filasCantidad: MatrixRow[] = [
    { label: "% de Compra", format: "pct", cells: tierCells("cantidad", "pctCompra") },
    { label: "Unidades Vendidas", format: "int", cells: o.unidadesCantidad.map((v) => ({ value: v })) },
    { label: "Precio de Venta", format: "money", cells: tierCells("cantidad", "precio") },
    { label: "Costo", format: "money", cells: tierCells("cantidad", "costo") },
    { label: "Ganancia", format: "int", cells: o.gananciaCantidad.map((v) => ({ value: v })) },
    { label: "Ventas Totales – Oferta", format: "money", cells: [], span: { value: o.ventasCantidad } },
    { label: "Costos Totales – Oferta", format: "money", cells: [], span: { value: o.costosCantidad } },
    { label: "Ganancia de la Oferta", format: "money", cells: [], span: { value: o.gananciaOfertaCantidad, tone: "green" } },
  ];

  const filasUpsell: MatrixRow[] = [
    { label: "% de Compra", format: "pct", cells: tierCells("upsells", "pctCompra") },
    { label: "Unidades Vendidas", format: "int", cells: o.unidadesUpsell.map((v) => ({ value: v })) },
    { label: "Precio de Venta", format: "money", cells: tierCells("upsells", "precio") },
    { label: "Costo", format: "money", cells: tierCells("upsells", "costo") },
    { label: "Ganancia", format: "int", cells: o.gananciaUpsell.map((v) => ({ value: v })) },
    { label: "Ventas Totales – Oferta", format: "money", cells: [], span: { value: o.ventasUpsell } },
    { label: "Costos Totales – Oferta", format: "money", cells: [], span: { value: o.costosUpsell } },
    { label: "Ganancia de la Oferta", format: "money", cells: [], span: { value: o.gananciaOfertaUpsell, tone: "green" } },
  ];

  /* ── Columna central: Análisis de Métricas ── */
  const metricas: SheetRow[] = leads
    ? [
        { label: "Inversión en Facebook", value: f.embudoLeads!.inversion, format: "money", onChange: on("embudoLeads.inversion") },
        { label: "CPM", value: f.embudoLeads!.cpm, format: "money", onChange: on("embudoLeads.cpm") },
        { label: "Impresiones", value: e.impresiones, format: "int", dim: true },
        { label: "Costo por Impresión", value: e.costoPorImpresion, format: "money", dim: true },
        { label: "CTR", value: f.embudoLeads!.ctr, format: "pct", onChange: on("embudoLeads.ctr") },
        { label: "Clics en en Enlace", value: e.clics, format: "int", dim: true },
        { label: "Costo por Clic", value: e.costoPorClic, format: "money", dim: true },
        { label: "Velocidad de Carga", value: f.embudoLeads!.velocidadCarga, format: "pct", onChange: on("embudoLeads.velocidadCarga") },
        { label: "Visualización del Contenido", value: e.visualizaciones, format: "int", dim: true },
        { label: "Costo por Visualización", value: e.costoPorVisualizacion, format: "money", dim: true },
        { label: "Convertion Rate", value: f.embudoLeads!.conversionRate, format: "pct", onChange: on("embudoLeads.conversionRate") },
        { label: "Ventas", value: e.ventas, format: "int", tone: "strong", dim: true },
        { label: "CPA Facebook", value: e.cpaFacebook, format: "money", dim: true },
        { label: "% de Confirmacion", value: f.embudoLeads!.pctConfirmacion, format: "pct", onChange: on("embudoLeads.pctConfirmacion") },
        { label: "Pedidos Enviados", value: e.pedidosEnviados, format: "int", dim: true },
        { label: "Costo por PedidosEnviado", value: e.costoPorPedidoEnviado, format: "money", dim: true },
        { label: "% de rechazo", value: f.embudoLeads!.pctRechazo, format: "pct", onChange: on("embudoLeads.pctRechazo") },
        { label: "Devoluciones", value: e.devoluciones, format: "int", dim: true },
        { label: "Entregas Efectivas", value: e.entregas, format: "int", tone: "strong", dim: true },
        { label: "Ingresos (Sin Upselles - Ofertas)", value: e.ingresosSinOfertas, format: "money", dim: true },
        { label: "CPA Real", value: e.cpaReal, format: "money", dim: true },
        { label: "ROAS Facebook", value: e.roasFacebook, format: "x", dim: true },
        { label: "ROAS Real", value: e.roasReal, format: "x", tone: "strong", dim: true },
      ]
    : [
        { label: "Inversión en Facebook", value: f.embudoMensajes!.inversion, format: "money", onChange: on("embudoMensajes.inversion") },
        { label: "Costo por mensaje", value: f.embudoMensajes!.costoPorMensaje, format: "money", onChange: on("embudoMensajes.costoPorMensaje") },
        { label: "Cantidad de mensajes", value: e.cantidadMensajes, format: "int", dim: true },
        { label: "Cierre por mensajes", value: f.embudoMensajes!.tasaCierre, format: "pct", onChange: on("embudoMensajes.tasaCierre") },
        { label: "Ventas", value: e.ventas, format: "int", tone: "strong", dim: true },
        { label: "CPA Facebook", value: e.cpaFacebook, format: "money", dim: true },
        { label: "Pedidos Enviados", value: e.pedidosEnviados, format: "int", dim: true },
        { label: "Costo por PedidosEnviado", value: e.costoPorPedidoEnviado, format: "money", dim: true },
        { label: "% de rechazo", value: f.embudoMensajes!.pctRechazo, format: "pct", onChange: on("embudoMensajes.pctRechazo") },
        { label: "Devoluciones", value: e.devoluciones, format: "int", dim: true },
        { label: "Entregas Efectivas", value: e.entregas, format: "int", tone: "strong", dim: true },
        { label: "Ingresos (Sin Upselles - Ofertas)", value: e.ingresosSinOfertas, format: "money", dim: true },
        { label: "CPA Real", value: e.cpaReal, format: "money", dim: true },
        { label: "ROAS Facebook", value: e.roasFacebook, format: "x", dim: true },
        { label: "ROAS Real", value: e.roasReal, format: "x", tone: "strong", dim: true },
      ];

  const inversionMinima: SheetRow[] = [
    { label: "Costo por venta", value: e.costoPorVenta, format: "money", dim: true },
    { label: "Ventas Deseadas", value: f.ventasDeseadas ?? 0, format: "int", onChange: on("ventasDeseadas") },
    { label: "Inversión Mínima Requerida", value: e.inversionMinima, format: "money", tone: "strong" },
  ];

  // Calculadora suelta del pie de la hoja: NO alimenta la "Velocidad de Carga" de arriba.
  const velocidad: SheetRow[] = [
    { label: "Clics en el Enlace", value: f.velocidad?.clics ?? 0, format: "int", onChange: on("velocidad.clics") },
    { label: "Visitantes ( Shopify)", value: f.velocidad?.visitantes ?? 0, format: "int", onChange: on("velocidad.visitantes") },
    { label: "Compras", value: f.velocidad?.compras ?? 0, format: "int", onChange: on("velocidad.compras") },
    { spacer: true },
    { label: "Velocidad de Carga", value: e.velocidadMedida ?? 0, format: "pct", tone: "strong" },
  ];

  /* ── Columna derecha: P&G ── */
  const pyg: SheetRow[] = [
    ...(leads
      ? ([{ label: "Ventas en Tienda Web ( Shopify)", value: pg.ventasTiendaWeb, format: "money", dim: true }] as SheetRow[])
      : []),
    { label: "Facturado Real por Producto Principal", value: pg.facturadoPrincipal, format: "money", dim: true },
    { label: "Facturado Real por Oferta", value: pg.facturadoOferta, format: "money", dim: true },
    { label: "Ingresos Totales", value: pg.ingresosTotales, format: "money", tone: "amber" },
    { spacer: true },
    { label: "Ingresos Reales", value: pg.ingresosReales, format: "money", dim: true },
    { label: "Costos del Producto - Principal", value: pg.costoProductoPrincipal, format: "money", dim: true },
    { label: "Costos de Producto - Oferta", value: pg.costoProductoOferta, format: "money", dim: true },
    { label: "Costos de Envío", value: pg.costosEnvio, format: "money", dim: true },
    { label: "Costos de Devoluciones", value: pg.costosDevoluciones, format: "money", dim: true },
    { label: "Costo de FullFillment", value: pg.costoFullfillment, format: "money", dim: true },
    { label: "Costos de Intermediación", value: pg.costosIntermediacion, format: "money", dim: true },
    { label: "Comisión de Pasarela de Pago", value: pg.comisionPasarela, format: "money", dim: true },
    { label: "Total Costos", value: pg.totalCostos, format: "money", tone: "strong" },
    { label: "Inversión en Publicidad", value: pg.inversionPublicidad, format: "money", dim: true },
    { label: "Profit Bruto", value: pg.profitBruto, format: "money", tone: pg.profitBruto >= 0 ? "green" : "amber" },
    { label: "Gastos Fijos / Administrativos", value: pg.gastosFijos, format: "money", dim: true },
    { label: "Profit Neto", value: pg.profitNeto, format: "money", tone: pg.profitNeto >= 0 ? "green" : "amber" },
    { spacer: true },
    { label: "Margen Bruto", value: pg.margenBruto, format: "pct", tone: "green" },
    { label: "Margen Neto", value: pg.margenNeto, format: "pct", tone: "green", note: "mayor al 30%" },
    { label: "ROI Ads", value: pg.roiAds, format: "pct", tone: "green", note: "los que escalan rápido tienen 100%" },
    { label: "% Conversion real", value: pg.conversionReal, format: "pct", tone: "green" },
    { label: "AOV real", value: pg.aovReal, format: "dec", tone: "green" },
    ...(leads
      ? ([
          { label: "CPA Maximo Facebook", value: pg.cpaMaximoFacebook, format: "dec", dim: true, note: `US$ ${pg.cpaMaximoFacebookUsd.toFixed(2)}` },
          { label: "Roas Minimo Facebook", value: pg.roasMinimoFacebook, format: "dec", dim: true },
          { label: "CPA Maximo Real", value: pg.cpaMaximo, format: "dec", dim: true },
          { label: "Roas Minimo Real", value: pg.roasMinimo, format: "dec", dim: true },
        ] as SheetRow[])
      : ([
          { label: "CPA Maximo", value: pg.cpaMaximo, format: "dec", dim: true },
          { label: "Roas Minimo", value: pg.roasMinimo, format: "dec", dim: true },
        ] as SheetRow[])),
    {
      label: "Capital Minimo de inversion necesaria",
      value: pg.capitalMinimo,
      format: "dec",
      dim: true,
      note: leads ? "Ciclo QUINCENAL" : "Ciclo Semanal",
    },
  ];

  const pctOfertas = f.cantidad.reduce((s, t) => s + t.pctCompra, 0);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const inputs: RentaSessionInputs = { ...f, kind: "rentabilidad" };
    try {
      const res = await fetch(
        calcId ? `/api/calculadora-costos/sessions/${calcId}` : "/api/calculadora-costos/sessions",
        {
          method: calcId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputs, snapshot: snapshotDe(inputs) }),
        },
      );
      if (!res.ok) throw new Error();
      const id = calcId ?? (await res.json()).id;
      setCalcId(id);
      router.push(`/tools/calculadora-costos/sesion/${id}`);
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <ToolShell name="Calculadora de Costos" trail="Análisis financiero">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-6 px-5 pb-20 pt-8 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="lp-serif text-[26px] leading-tight text-[#f6f2eb]">Análisis financiero</h1>
            <p className="mt-1 font-[Lato] text-[13px] text-[#c9b4ae]">
              Toda la hoja a la vista. Edita cualquier casilla y el P&amp;G de la derecha se
              recalcula solo. Cuando estés conforme, guarda.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button type="button" onClick={guardar} disabled={guardando} className="jr-cta h-11 rounded-xl px-6 text-[14px] cursor-pointer">
              <Save className="h-4 w-4" />
              {guardando ? "Guardando…" : "Guardar y ver dashboard"}
            </button>
            {error && <p role="alert" className="text-[12px] text-[#ff5a3c]">{error}</p>}
          </div>
        </header>

        {/* Embudo: las dos hojas del maestro son la misma vista con distinta entrada. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[#a98c88]">Tipo de embudo:</span>
          {([
            ["leads", "Por Leads (web / contra entrega)"],
            ["mensajes", "Por Mensajes (chat / DM)"],
          ] as [Funnel, string][]).map(([k, t]) => (
            <button
              key={k}
              type="button"
              // Sin el guard, clickear el embudo YA activo borra la hoja llena sin avisar
              // (y sin que nada cambie, así que el aviso de abajo ni siquiera lo describe).
              onClick={() => f.funnel !== k && setF(structuredClone(DEFAULTS[k]))}
              className={[
                "rounded-lg border px-3.5 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer",
                f.funnel === k
                  ? "border-[rgba(232,70,122,0.5)] bg-[rgba(189,19,71,0.18)] text-[#f6f2eb]"
                  : "border-white/[0.1] text-[#a98c88] hover:border-white/[0.25] hover:text-[#efe7e0]",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-[#a98c88]">
            Cambiar de embudo reinicia la hoja con los valores de referencia de esa hoja.
          </span>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Izquierda */}
          <div className="flex flex-col gap-5">
            <SheetBlock title="Datos de Operación" rows={operacion} />
            <SheetBlock title="Gastos Administrativos (Fijos)" rows={admin} />
            <p className="text-[11px] leading-relaxed text-[#a98c88]">
              Nota: el % de compra debe sumar el 100% entre las 3 ofertas; puedes sacar esa
              información de tu formulario.
            </p>
            {Math.abs(pctOfertas - 1) > 0.001 && (
              <div className="rounded-md border border-[rgba(246,173,85,0.35)] bg-[rgba(246,173,85,0.08)] px-3 py-2 text-[11px] text-[#f6ad55]">
                Tus % suman {(pctOfertas * 100).toFixed(0)}%, no 100%.{" "}
                {pctOfertas < 1
                  ? "Quedan compradores sin oferta, así que las ventas salen más bajas de lo real."
                  : "Estás contando más compradores de los que tienes, así que las ventas salen infladas."}
              </div>
            )}
            <SheetMatrix
              title="Análisis de Oferta - Cantidad"
              columns={["Oferta por Cantidad 01", "Oferta por Cantidad 02", "Oferta por Cantidad 03"]}
              rows={filasCantidad}
            />
            <SheetMatrix
              title="Análisis de Oferta - Upselles"
              columns={["Upsell 01", "Upsell 02"]}
              rows={filasUpsell}
            />
          </div>

          {/* Centro */}
          <div className="flex flex-col gap-5">
            <SheetBlock title="Análisis de Métricas" rows={metricas} />
            <SheetBlock rows={inversionMinima} />
            <SheetBlock rows={velocidad} />
          </div>

          {/* Derecha */}
          <div className="flex flex-col gap-5">
            <SheetBlock
              rows={[
                {
                  label: "Días de Análisis",
                  value: f.diasAnalisis ?? 30,
                  format: "int",
                  onChange: on("diasAnalisis"),
                },
              ]}
            />
            <SheetBlock title="P&G" rows={pyg} />
          </div>
        </div>
      </div>
    </ToolShell>
  );
}

export default function PaginaRentabilidad() {
  return (
    <Suspense fallback={null}>
      <HojaRentabilidad />
    </Suspense>
  );
}
