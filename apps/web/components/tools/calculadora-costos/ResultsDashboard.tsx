"use client";

import { Download, Info, Pencil } from "lucide-react";
import { calcular, calcularPrecio, type Funnel } from "@/lib/calculadora-costos/model";

/**
 * Vista de dashboard: lo que se ve DESPUÉS de guardar la hoja. La hoja es para llenar;
 * esto es para leer, así que no repite la tabla — resume, ordena y señala.
 *
 * Decisiones de visualización (skill `dataviz`):
 *  · Una sola figura héroe por vista, en sans, ≥48px.
 *  · El desglose de costos son SIETE clases que importan: eso es una tabla / barras
 *    ordenadas por magnitud con UN solo tono, no una dona de siete colores. El set de
 *    grises que había antes fallaba el gate de separación (ΔE 7.3 entre adyacentes:
 *    indistinguibles incluso con visión normal).
 *  · CPA real contra CPA máximo es "una razón contra un límite" → medidor, no gráfico.
 */

const ACCENT = "#E8467A";
const OK = "#3ED88A";
const WARN = "#F6AD55";
const BAD = "#FF5A3C";

export const fmtMoney = (n: number) =>
  "S/ " + (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
export const fmtPct = (n: number) => ((Number.isFinite(n) ? n : 0) * 100).toFixed(1) + "%";
export const fmtNum = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
export const fmtX = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2) + "x";

/** Tooltip CSS-only (sin JS): hover/focus sobre el ícono muestra la leyenda. */
export function Help({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group/tip" tabIndex={0}>
      <Info className="h-3.5 w-3.5 cursor-help text-[#a98c88]/60 transition-colors hover:text-[#f6f2eb]" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 bottom-full z-30 mb-2 w-64 rounded-lg border border-white/[0.12] bg-[#15151c] px-3 py-2 text-[12px] leading-snug text-[#c9b4ae] opacity-0 shadow-xl transition-opacity duration-150 group-hover/tip:opacity-100 group-focus/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/** Stat tile: rótulo · valor · nota opcional. Cifras proporcionales, no tabulares. */
export function Kpi({
  label,
  value,
  note,
  help,
  color,
}: {
  label: string;
  value: string;
  note?: string;
  help?: string;
  color?: string;
}) {
  return (
    <div className="jr-card rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-[#a98c88]">
        {label}
        {help && <Help text={help} />}
      </div>
      <div className="mt-1 font-sans text-[22px] font-semibold leading-tight" style={{ color: color ?? "#f6f2eb" }}>
        {value}
      </div>
      {note && <div className="mt-0.5 text-[11px] text-[#a98c88]">{note}</div>}
    </div>
  );
}

/** Barra de magnitud: un solo tono, extremo redondeado 4px, tope de 14px de grosor. */
function MagnitudeRow({
  label,
  value,
  max,
  display,
  sub,
  color = ACCENT,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  sub?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-[#c9b4ae]">{label}</span>
        <span className="readout text-[12px] tabular-nums text-[#efe7e0]">
          {display}
          {sub && <span className="ml-1.5 text-[#a98c88]">{sub}</span>}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-l-[1px] rounded-r bg-white/[0.05]">
        <div className="h-full rounded-r" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-sans text-[14px] font-bold text-[#efe7e0]">{titulo}</h2>
      {children}
    </section>
  );
}

function Acciones({
  onExport,
  exporting,
  exportError,
  onEdit,
  editLabel,
}: {
  onExport?: () => void;
  exporting?: boolean;
  exportError?: string | null;
  onEdit?: () => void;
  editLabel: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-3">
        {onEdit && (
          <button type="button" onClick={onEdit} className="jr-btn-secondary h-11 rounded-xl px-5 text-[13px] cursor-pointer">
            <Pencil className="h-4 w-4" /> {editLabel}
          </button>
        )}
        {onExport && (
          <button type="button" disabled={exporting} onClick={onExport} className="jr-cta h-11 rounded-xl px-5 text-[13px] cursor-pointer">
            <Download className="h-4 w-4" />
            {exporting ? "Generando Excel…" : "Exportar a Excel"}
          </button>
        )}
      </div>
      {exportError && <p role="alert" className="text-[13px] text-[#ff5a3c]">{exportError}</p>}
    </div>
  );
}

/* ══════════════════ Rentabilidad ══════════════════ */

export default function ResultsDashboard({
  result,
  funnel,
  onExport,
  exporting,
  exportError,
  onEdit,
}: {
  result: ReturnType<typeof calcular>;
  funnel: Funnel;
  onExport?: () => void;
  exporting?: boolean;
  exportError?: string | null;
  onEdit?: () => void;
}) {
  const { pg, embudo: e, ofertas: o } = result;
  const pn = pg.profitNeto;

  const estado =
    pn < 0
      ? { c: BAD, label: "No rentable", msg: "Con estos números pierdes dinero. Sube el precio, baja costos o mejora la conversión." }
      : pg.margenNeto < 0.1
        ? { c: WARN, label: "Rentable pero ajustado", msg: "Ganas, pero con margen delgado. Poco espacio para imprevistos o devoluciones." }
        : { c: OK, label: "Rentable", msg: "Buen margen. Con estos números el negocio se sostiene y deja ganancia." };

  // Las siete clases de costo, ordenadas por magnitud. Un solo tono: lo que se compara
  // es cuánto pesa cada una, no cuál es cuál — eso lo dice el rótulo, no el color.
  const ing = pg.ingresosTotales || 1;
  const destino = [
    { label: "Costo de producto", val: pg.costoProductoPrincipal + pg.costoProductoOferta },
    { label: "Envío y devoluciones", val: pg.costosEnvio + pg.costosDevoluciones },
    { label: "Empaque / fullfillment", val: pg.costoFullfillment },
    { label: "Comisión de pasarela", val: pg.comisionPasarela },
    { label: "Gastos fijos", val: pg.gastosFijos },
    { label: "Inversión en publicidad", val: pg.inversionPublicidad },
  ]
    .filter((s) => s.val > 0)
    .sort((a, b) => b.val - a.val);
  const maxDestino = Math.max(...destino.map((d) => d.val), Math.abs(pn));

  // Embudo: una sola serie de magnitud decreciente.
  const etapas = (
    funnel === "leads"
      ? [
          { label: "Impresiones", v: e.impresiones },
          { label: "Clics en el enlace", v: e.clics },
          { label: "Visualizaciones", v: e.visualizaciones },
          { label: "Ventas", v: e.ventas },
          { label: "Pedidos enviados", v: e.pedidosEnviados },
          { label: "Entregas efectivas", v: e.entregas },
        ]
      : [
          { label: "Mensajes recibidos", v: e.cantidadMensajes },
          { label: "Ventas", v: e.ventas },
          { label: "Pedidos enviados", v: e.pedidosEnviados },
          { label: "Entregas efectivas", v: e.entregas },
        ]
  ).filter((x) => Number.isFinite(x.v));
  const maxEtapa = Math.max(...etapas.map((x) => x.v), 1);

  // CPA real contra el tope: una razón contra un límite → medidor.
  const holgura = pg.cpaMaximo > 0 ? e.cpaReal / pg.cpaMaximo : 0;
  const colorCpa = holgura > 1 ? BAD : holgura > 0.8 ? WARN : OK;

  return (
    <div className="flex flex-col gap-8">
      {/* Héroe + KPIs */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
        <div className="jr-card lp-leak flex flex-col justify-between rounded-2xl p-6">
          <div className="relative flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: estado.c }} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: estado.c }}>
              {estado.label}
            </span>
          </div>
          <div className="relative mt-4">
            <div className="text-[13px] text-[#c9b4ae]">Utilidad neta proyectada al mes</div>
            {/* Figura héroe: sans, ≥48px, cifras proporcionales. */}
            <div className="mt-1 font-sans text-[clamp(38px,5vw,52px)] font-semibold leading-none" style={{ color: estado.c }}>
              {fmtMoney(pn)}
            </div>
          </div>
          <p className="relative mt-4 text-[13px] leading-relaxed text-[#c9b4ae]">{estado.msg}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Kpi label="Ingresos / mes" value={fmtMoney(pg.ingresosTotales)} help="Total facturado en el mes con estas ventas, incluyendo upsells." />
          <Kpi label="Margen bruto" value={fmtPct(pg.margenBruto)} help="Lo que queda tras costos de producto, operación y publicidad — antes de los gastos fijos." />
          <Kpi label="Margen neto" value={fmtPct(pg.margenNeto)} note="objetivo: sobre 30%" help="De cada sol que vendes, cuánto queda como ganancia final." />
          <Kpi label="ROI Ads" value={fmtPct(pg.roiAds)} note="los que escalan rápido: 100%" help="Por cada sol invertido en publicidad, cuánto ganas de utilidad." />
          <Kpi label="ROAS real" value={fmtX(embudoRoas(e))} help="Por cada sol en ads, cuántos soles de venta real generas (ya con entregas)." />
          <Kpi label="Ticket promedio" value={fmtMoney(pg.aovReal)} help="Cuánto factura en promedio cada cliente que recibe el producto." />
        </div>
      </div>

      {/* Medidor de CPA */}
      <Seccion titulo="¿Cuánto margen te queda para pagar por una venta?">
        <div className="jr-card rounded-2xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[12px] text-[#a98c88]">CPA real hoy</div>
              <div className="font-sans text-[26px] font-semibold" style={{ color: colorCpa }}>{fmtMoney(e.cpaReal)}</div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 text-[12px] text-[#a98c88]">
                CPA máximo
                <Help text="Lo máximo que puedes pagar por una venta entregada sin perder dinero. Si tu CPA real lo supera, estás en rojo." />
              </div>
              <div className="readout text-[16px] font-semibold text-[#efe7e0]">{fmtMoney(pg.cpaMaximo)}</div>
            </div>
          </div>
          {/* Medidor: relleno = severidad; la pista es un paso claro del mismo tono. */}
          <div className="mt-4 h-3 w-full overflow-hidden rounded bg-[rgba(232,70,122,0.14)]">
            <div className="h-full rounded-r" style={{ width: `${Math.min(100, holgura * 100)}%`, background: colorCpa }} />
          </div>
          <p className="mt-2.5 text-[12px] text-[#a98c88]">
            {holgura > 1
              ? `Estás pagando ${fmtPct(holgura - 1)} por encima de tu tope: cada venta te resta.`
              : `Usas el ${fmtPct(holgura)} de tu tope. Te queda ${fmtMoney(pg.cpaMaximo - e.cpaReal)} de aire por venta.`}
          </p>
        </div>
      </Seccion>

      {/* Embudo + destino del dinero */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion titulo="Tu embudo, etapa por etapa">
          <div className="jr-card flex flex-col gap-3.5 rounded-2xl p-5">
            {etapas.map((x) => (
              <MagnitudeRow key={x.label} label={x.label} value={x.v} max={maxEtapa} display={fmtNum(x.v)} />
            ))}
            <p className="mt-1 text-[11px] text-[#a98c88]">
              Conversión real: {fmtPct(pg.conversionReal)} · {fmtNum(e.entregas)} entregas de {fmtNum(e.ventas)} ventas.
            </p>
          </div>
        </Seccion>

        <Seccion titulo="¿A dónde va cada sol que vendes?">
          <div className="jr-card flex flex-col gap-3.5 rounded-2xl p-5">
            {destino.map((s) => (
              <MagnitudeRow
                key={s.label}
                label={s.label}
                value={s.val}
                max={maxDestino}
                display={fmtMoney(s.val)}
                sub={fmtPct(s.val / ing)}
              />
            ))}
            <div className="mt-1 border-t border-white/[0.08] pt-3.5">
              <MagnitudeRow
                label="Te queda como utilidad"
                value={Math.max(0, pn)}
                max={maxDestino}
                display={fmtMoney(pn)}
                sub={fmtPct(pn / ing)}
                color={pn >= 0 ? OK : BAD}
              />
            </div>
          </div>
        </Seccion>
      </div>

      {/* Límites + ofertas */}
      <Seccion titulo="Tus límites y tu caja">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="ROAS mínimo" value={fmtX(pg.roasMinimo)} help="El ROAS más bajo que puedes tener sin perder dinero. Por debajo de esto, pierdes." />
          <Kpi
            label="Capital mínimo"
            value={fmtMoney(pg.capitalMinimo)}
            note={funnel === "leads" ? "ciclo quincenal" : "ciclo semanal"}
            help="El dinero que necesitas tener disponible para operar un ciclo sin quedarte corto."
          />
          <Kpi label="Inversión mínima" value={fmtMoney(embudoMin(e))} note={`para ${fmtNum(e.ventasDeseadas)} ventas`} help="Lo que tendrías que invertir en ads para llegar a tus ventas deseadas, al costo por venta de hoy." />
          <Kpi label="Entregas / mes" value={fmtNum(e.entregas)} help="De todas las ventas, cuántas terminan entregadas y cobradas." />
        </div>
      </Seccion>

      <Seccion titulo="De dónde sale la facturación">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-white/[0.03] text-[11px] uppercase tracking-[0.06em] text-[#a98c88]">
                <th className="px-4 py-2.5 text-left font-semibold">Origen</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ventas</th>
                <th className="px-4 py-2.5 text-right font-semibold">Costos</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ganancia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              <tr>
                <td className="px-4 py-2.5 text-[#c9b4ae]">Ofertas por cantidad</td>
                <td className="readout px-4 py-2.5 text-right tabular-nums text-[#efe7e0]">{fmtMoney(o.ventasCantidad)}</td>
                <td className="readout px-4 py-2.5 text-right tabular-nums text-[#a98c88]">{fmtMoney(o.costosCantidad)}</td>
                <td className="readout px-4 py-2.5 text-right tabular-nums" style={{ color: OK }}>{fmtMoney(o.gananciaOfertaCantidad)}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-[#c9b4ae]">Upsells</td>
                <td className="readout px-4 py-2.5 text-right tabular-nums text-[#efe7e0]">{fmtMoney(o.ventasUpsell)}</td>
                <td className="readout px-4 py-2.5 text-right tabular-nums text-[#a98c88]">{fmtMoney(o.costosUpsell)}</td>
                <td className="readout px-4 py-2.5 text-right tabular-nums" style={{ color: OK }}>{fmtMoney(o.gananciaOfertaUpsell)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Seccion>

      <Acciones onExport={onExport} exporting={exporting} exportError={exportError} onEdit={onEdit} editLabel="Editar la hoja" />
    </div>
  );
}

const embudoRoas = (e: Record<string, number>) => e.roasReal ?? 0;
const embudoMin = (e: Record<string, number>) => e.inversionMinima ?? 0;

/* ══════════════════ Costeo de precio ══════════════════ */

export function PrecioDashboard({
  result,
  precioManual,
  margenEsperado,
  onEdit,
  onExport,
  exporting,
  exportError,
}: {
  result: ReturnType<typeof calcularPrecio>;
  precioManual: number;
  margenEsperado: number;
  onEdit?: () => void;
  onExport?: () => void;
  exporting?: boolean;
  exportError?: string | null;
}) {
  const alcanza = precioManual >= result.precioMinimo;
  const color = result.manual.utilidad < 0 ? BAD : alcanza ? OK : WARN;

  const costos = [
    { label: "Costo de intermediación", val: result.manual.costoIntermediacion },
    { label: "Comisión de pasarela", val: result.manual.comisionPasarela },
    { label: "Costos financieros (4x1000)", val: result.manual.costosFinancieros },
  ].filter((c) => c.val > 0);
  const max = Math.max(...costos.map((c) => c.val), Math.abs(result.manual.utilidad));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
        <div className="jr-card lp-leak flex flex-col justify-between rounded-2xl p-6">
          <div className="relative text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>
            Precio mínimo para tu margen
          </div>
          <div className="relative mt-4">
            <div className="mt-1 font-sans text-[clamp(38px,5vw,52px)] font-semibold leading-none text-[#f6f2eb]">
              {fmtMoney(result.precioMinimo)}
            </div>
            <div className="mt-1.5 text-[13px] text-[#c9b4ae]">
              es lo mínimo que puedes cobrar para dejar {fmtPct(margenEsperado)} de margen.
            </div>
          </div>
          <p className="relative mt-4 text-[13px] leading-relaxed" style={{ color }}>
            {result.manual.utilidad < 0
              ? `A S/ ${Math.round(precioManual)} pierdes ${fmtMoney(-result.manual.utilidad)} por unidad.`
              : alcanza
                ? `Tu precio de S/ ${Math.round(precioManual)} cubre el margen que buscas.`
                : `A S/ ${Math.round(precioManual)} ganas, pero por debajo del margen que pediste.`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Kpi label="Costo de intermediación" value={fmtMoney(result.costeo.costoIntermediacion)} help="Mercancía + flete + costo por compra + fullfillment: lo que te cuesta poner una unidad en manos del cliente." />
          <Kpi label="Total costos (precio mínimo)" value={fmtMoney(result.costeo.totalCostos)} help="Costo de intermediación más comisiones y costos financieros, sobre el precio mínimo." />
          <Kpi label="Utilidad al precio mínimo" value={fmtMoney(result.costeo.utilidad)} note={fmtPct(result.costeo.pctIngreso)} color={OK} help="Lo que te queda por unidad si vendes al precio mínimo estimado." />
          <Kpi label="Precio manual" value={fmtMoney(precioManual)} help="El precio que fijaste a mano para compararlo contra el mínimo." />
          <Kpi label="Total costos (precio manual)" value={fmtMoney(result.manual.totalCostos)} help="Los mismos costos, calculados sobre tu precio manual." />
          <Kpi label="Utilidad al precio manual" value={fmtMoney(result.manual.utilidad)} note={fmtPct(result.manual.pctIngreso)} color={color} help="Lo que te queda por unidad al precio que fijaste." />
        </div>
      </div>

      <Seccion titulo="Cómo se reparte tu precio manual">
        <div className="jr-card flex flex-col gap-3.5 rounded-2xl p-5">
          {costos.map((c) => (
            <MagnitudeRow
              key={c.label}
              label={c.label}
              value={c.val}
              max={max}
              display={fmtMoney(c.val)}
              sub={precioManual ? fmtPct(c.val / precioManual) : undefined}
            />
          ))}
          <div className="mt-1 border-t border-white/[0.08] pt-3.5">
            <MagnitudeRow
              label="Te queda como utilidad"
              value={Math.max(0, result.manual.utilidad)}
              max={max}
              display={fmtMoney(result.manual.utilidad)}
              sub={fmtPct(result.manual.pctIngreso)}
              color={color}
            />
          </div>
        </div>
      </Seccion>

      <Acciones onExport={onExport} exporting={exporting} exportError={exportError} onEdit={onEdit} editLabel="Editar la hoja" />
    </div>
  );
}
