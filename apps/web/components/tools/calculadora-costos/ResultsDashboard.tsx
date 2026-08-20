"use client";

import { Download, Info } from "lucide-react";
import { calcular, type Funnel } from "@/lib/calculadora-costos/model";

export const fmtMoney = (n: number) =>
  "S/ " + (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
export const fmtPct = (n: number) => ((Number.isFinite(n) ? n : 0) * 100).toFixed(1) + "%";
export const fmtNum = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
export const fmtX = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2) + "x";

// Tooltip CSS-only (sin JS): hover/focus sobre el ícono muestra la leyenda.
export function Help({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group/tip" tabIndex={0}>
      <Info className="w-3.5 h-3.5 text-[#a98c88]/60 hover:text-[#f6f2eb] transition-colors cursor-help" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 bottom-full z-30 mb-2 w-64 rounded-lg border border-white/[0.12] bg-[#15151c] px-3 py-2 text-[12px] leading-snug text-[#c9b4ae] opacity-0 shadow-xl transition-opacity duration-150 group-hover/tip:opacity-100 group-focus/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[#a98c88]">{label}</div>
      <div className="readout text-[15px] font-semibold text-[#efe7e0]">{value}</div>
    </div>
  );
}

function Card({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-[#a98c88]">
        {label}
        <Help text={help} />
      </div>
      <div className="text-[19px] font-bold text-[#efe7e0] mt-1 readout">{value}</div>
    </div>
  );
}

export default function ResultsDashboard({
  result, funnel, onExport, exporting, exportError,
}: {
  result: ReturnType<typeof calcular>; funnel: Funnel; onExport: () => void; exporting: boolean; exportError: string | null;
}) {
  const { pg, embudo } = result;
  const pn = pg.profitNeto;
  const estado =
    pn < 0
      ? { c: "#ff5a3c", bg: "rgba(233,61,61,0.1)", b: "rgba(233,61,61,0.4)", label: "No rentable", msg: "Con estos números pierdes dinero. Sube el precio, baja costos o mejora la conversión." }
      : pg.margenNeto < 0.1
      ? { c: "#f6ad55", bg: "rgba(246,173,85,0.1)", b: "rgba(246,173,85,0.4)", label: "Rentable pero ajustado", msg: "Ganas, pero con margen delgado. Poco espacio para imprevistos o devoluciones." }
      : { c: "#3ed88a", bg: "rgba(44,207,111,0.1)", b: "rgba(44,207,111,0.4)", label: "Rentable", msg: "¡Buen margen! Con estos números el negocio se sostiene y deja ganancia." };

  const ing = pg.ingresosTotales || 1;
  // El color codifica el TIPO de gasto, no lo distingue por distinguir: los
  // costos son una rampa neutra que aclara, la inversión en ads va en naranja
  // (es la única palanca que el usuario mueve a diario) y lo que sobra en verde.
  const segs = [
    { label: "Costo de producto", val: pg.costoProductoPrincipal + pg.costoProductoOferta, color: "#5f5f66" },
    { label: "Envío y devoluciones", val: pg.costosEnvio + pg.costosDevoluciones, color: "#767680" },
    { label: "Empaque", val: pg.costoFullfillment, color: "#8d8d97" },
    { label: "Comisión pasarela", val: pg.comisionPasarela, color: "#a4a4ae" },
    { label: "Gastos fijos", val: pg.gastosFijos, color: "#bbbbc5" },
    { label: "Inversión en ads", val: pg.inversionPublicidad, color: "#e8467a" },
    { label: "Utilidad neta", val: Math.max(0, pn), color: "#3ed88a" },
  ].filter((s) => s.val > 0);

  return (
    <div className="flex flex-col gap-7">
      {/* Semáforo + número principal */}
      <div className="rounded-2xl border p-6" style={{ background: estado.bg, borderColor: estado.b }}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: estado.c }} />
          <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: estado.c }}>{estado.label}</span>
        </div>
        <div className="text-[40px] font-bold mt-2 readout" style={{ color: estado.c }}>{fmtMoney(pn)}</div>
        <div className="text-[13px] text-[#c9b4ae]">Utilidad neta proyectada al mes</div>
        <p className="text-[13px] text-[#c9b4ae] mt-3 leading-relaxed">{estado.msg}</p>
      </div>

      {/* Rentabilidad */}
      <div>
        <h3 className="text-[14px] font-bold text-[#efe7e0] mb-3">Rentabilidad</h3>
        <div className="grid grid-cols-3 gap-3">
          <Card label="Margen bruto" value={fmtPct(pg.margenBruto)} help="De cada sol que vendes, cuánto queda después de costos de producto y operación (antes de gastos fijos)." />
          <Card label="Margen neto" value={fmtPct(pg.margenNeto)} help="De cada sol que vendes, cuánto queda como ganancia final (después de TODO)." />
          <Card label="ROI Ads" value={fmtPct(pg.roiAds)} help="Por cada sol invertido en publicidad, cuánto ganas de utilidad. 100% = duplicas tu inversión." />
          <Card label="ROAS real" value={fmtX(embudo.roasReal)} help="Por cada sol en ads, cuántos soles de venta real generas (ya con entregas)." />
          <Card label="Ticket promedio" value={fmtMoney(pg.aovReal)} help="Cuánto factura en promedio cada cliente que recibe el producto." />
          <Card label="Ingresos / mes" value={fmtMoney(pg.ingresosTotales)} help="Total que facturas en el mes con estas ventas." />
        </div>
      </div>

      {/* Límites */}
      <div>
        <h3 className="text-[14px] font-bold text-[#efe7e0] mb-3">Tus límites (hasta dónde puedes estirarte)</h3>
        <div className="grid grid-cols-3 gap-3">
          <Card label="CPA máximo" value={fmtMoney(pg.cpaMaximo)} help="Lo MÁXIMO que puedes pagar por conseguir una venta sin perder dinero. Si tu CPA real lo supera, estás en rojo." />
          <Card label="CPA real (hoy)" value={fmtMoney(embudo.cpaReal)} help="Lo que te cuesta hoy cada venta entregada. Compáralo con el CPA máximo." />
          <Card label="ROAS mínimo" value={fmtX(pg.roasMinimo)} help="El ROAS más bajo que puedes tener sin perder dinero. Por debajo de esto, pierdes." />
          <Card label="Capital mínimo" value={fmtMoney(pg.capitalMinimo)} help={`El dinero que necesitas tener disponible para operar un ciclo ${funnel === "leads" ? "quincenal" : "semanal"} sin quedarte corto.`} />
          <Card label="Ventas / mes" value={fmtNum(embudo.ventas)} help="Cuántas ventas genera tu embudo en el mes con estos números." />
          <Card label="Entregas / mes" value={fmtNum(embudo.entregas)} help="De esas ventas, cuántas terminan entregadas y cobradas." />
        </div>
      </div>

      {/* A dónde va cada sol */}
      <div>
        <h3 className="text-[14px] font-bold text-[#efe7e0] mb-3">¿A dónde va cada sol que vendes?</h3>
        <div className="flex h-4 w-full overflow-hidden rounded-full border border-white/[0.08]">
          {segs.map((s) => (
            <div key={s.label} style={{ width: `${(s.val / ing) * 100}%`, background: s.color }} title={`${s.label}: ${fmtMoney(s.val)}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-4">
          {segs.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-2 text-[#c9b4ae]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="text-[#a98c88] readout">{fmtPct(s.val / ing)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 items-start">
        <button type="button" disabled={exporting} onClick={onExport}
          className="jr-cta rounded-xl px-6 py-3 text-[14px] cursor-pointer">
          <Download className="w-4 h-4" />
          {exporting ? "Generando Excel…" : "Exportar análisis a Excel"}
        </button>
        {exportError && (
          <p role="alert" className="text-[13px] text-[#ff5a3c]">{exportError}</p>
        )}
      </div>
    </div>
  );
}
