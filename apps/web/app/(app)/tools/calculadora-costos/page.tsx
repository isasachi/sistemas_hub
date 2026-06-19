"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Sparkles, Info } from "lucide-react";
import {
  calcular,
  precioSugerido,
  type CalcInputs,
  type Funnel,
} from "@/lib/calculadora-costos/model";
import { exportarXlsx } from "@/lib/calculadora-costos/export-xlsx";

// Estimados por defecto (valores muestra validados de cada hoja). El usuario los pisa si los sabe.
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
  },
};

type Kind = "money" | "pct" | "number";
const accent = "#ff9c4d";

const fmtMoney = (n: number) =>
  "S/ " + (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((Number.isFinite(n) ? n : 0) * 100).toFixed(1) + "%";
const fmtNum = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
const fmtX = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2) + "x";

// Tooltip CSS-only (sin JS): hover/focus sobre el ícono muestra la leyenda.
function Help({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group/tip" tabIndex={0}>
      <Info className="w-3.5 h-3.5 text-[#6a6a6a] hover:text-[#ff9c4d] cursor-help" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 bottom-full z-30 mb-2 w-64 rounded-lg border border-white/[0.12] bg-[#15151c] px-3 py-2 text-[12px] leading-snug text-[#bdbdbd] opacity-0 shadow-xl transition-opacity duration-150 group-hover/tip:opacity-100 group-focus/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

// Campo numérico con leyenda (tooltip) y badge "estimado" mientras no lo edites.
function Field({
  label, kind, value, estimated, onChange, help,
}: {
  label: string; kind: Kind; value: number; estimated: boolean;
  onChange: (n: number) => void; help: string;
}) {
  const display = kind === "pct" ? value * 100 : value;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[13px] text-[#bdbdbd]">
        {label}
        <Help text={help} />
        {estimated && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#ff9c4d] bg-[rgba(255,156,77,0.12)] border border-[rgba(255,156,77,0.3)] rounded px-1.5 py-0.5">
            estimado
          </span>
        )}
      </span>
      <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 focus-within:border-[rgba(255,156,77,0.5)]">
        {kind === "money" && <span className="text-[13px] text-[#8a8a8a]">S/</span>}
        <input
          type="number"
          step="any"
          value={Number.isFinite(display) ? +display.toFixed(4) : ""}
          onChange={(e) => onChange(kind === "pct" ? Number(e.target.value) / 100 : Number(e.target.value))}
          className="h-10 w-full bg-transparent text-[15px] text-[#f5f5f5] outline-none"
        />
        {kind === "pct" && <span className="text-[13px] text-[#8a8a8a]">%</span>}
      </div>
    </label>
  );
}

export default function CalculadoraCostos() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CalcInputs>(structuredClone(DEFAULTS.leads));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const result = useMemo(() => calcular(form), [form]);
  const isEst = (key: string) => !touched.has(key);

  function set(path: string, val: number) {
    setTouched((t) => new Set(t).add(path));
    setForm((prev) => {
      const next = structuredClone(prev);
      const parts = path.split(".");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let obj: any = next;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = val;
      return next;
    });
  }

  function switchFunnel(f: Funnel) {
    setForm(structuredClone(DEFAULTS[f]));
    setTouched(new Set());
    setStep(1);
  }

  // Helper para construir un campo del paso (toma path absoluto del form).
  const f = (path: string, label: string, kind: Kind, help: string) => (
    <Field
      key={path}
      label={label}
      kind={kind}
      help={help}
      value={pathGet(form, path)}
      estimated={isEst(path)}
      onChange={(n) => set(path, n)}
    />
  );

  const op = form.operacion;
  const pctOfertas = form.cantidad.reduce((s, t) => s + t.pctCompra, 0);

  // --- Definición de pasos (data-driven, uno por idea, lenguaje coloquial) ---
  const steps: { title: string; intro: string; body: React.ReactNode }[] = [
    {
      title: "¿Cómo vendes?",
      intro: "Lo primero: contanos cómo llega la venta. El resto del cálculo es igual para ambos.",
      body: (
        <div className="flex flex-col gap-3">
          {([
            { f: "leads" as Funnel, t: "Por Leads (web / contra entrega)", d: "Tu anuncio lleva a una página o formulario, el cliente deja sus datos y pagas/cobras al entregar." },
            { f: "mensajes" as Funnel, t: "Por Mensajes (chat / DM)", d: "Tu anuncio abre un chat de WhatsApp/Instagram y tu equipo cierra la venta conversando." },
          ]).map(({ f: ff, t, d }) => (
            <button key={ff} type="button" onClick={() => switchFunnel(ff)}
              className={[
                "text-left rounded-xl border p-4 transition-all",
                form.funnel === ff ? "border-[rgba(255,156,77,0.5)] bg-[rgba(255,156,77,0.06)]" : "border-white/[0.08] hover:border-white/[0.2]",
              ].join(" ")}>
              <div className="text-[15px] font-semibold text-[#f5f5f5]">{t}</div>
              <div className="text-[13px] text-[#8a8a8a] mt-1 leading-relaxed">{d}</div>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Tu producto",
      intro: "Empecemos por lo más simple: a cuánto lo vendes y cuánto te cuesta a ti.",
      body: (
        <div className="flex flex-col gap-4">
          {f("operacion.precioVenta", "Precio de venta", "money", "El precio al que le vendes una unidad a tu cliente final.")}
          <button type="button" onClick={() => set("operacion.precioVenta", precioSugerido(op, 0.35, result.embudo.cpaReal))}
            className="self-start flex items-center gap-1.5 text-[12px] text-[#ff9c4d] hover:underline">
            <Sparkles className="w-3.5 h-3.5" /> No sé qué precio poner — sugiérelo (cubre costos + ads, margen 35%)
          </button>
          {f("operacion.costoProducto", "Costo del producto", "money", "Lo que te cuesta a ti comprar o producir una unidad.")}
        </div>
      ),
    },
    {
      title: "Costo de cada entrega",
      intro: "Cada pedido que mandas tiene gastos de envío y de preparación.",
      body: (
        <div className="flex flex-col gap-4">
          {f("operacion.flete", "Flete de envío", "money", "Cuánto pagas por enviar un pedido al cliente (courier/delivery).")}
          {f("operacion.fullfillment", "Empaque / preparación", "money", "Costo de empacar y alistar cada pedido (almacén, manipuleo).")}
        </div>
      ),
    },
    {
      title: "Cobros y gastos fijos",
      intro: "¿Cobras con pasarela de pago? ¿Cuánto gastas fijo cada mes pase lo que pase?",
      body: (
        <div className="flex flex-col gap-4">
          {f("operacion.pctPasarela", "% de ventas por pasarela", "pct", "Qué parte de tus ventas se cobra online (tarjeta/Yape). Si vendes solo contra entrega, déjalo en 0%.")}
          {f("operacion.comisionPasarela", "Comisión de la pasarela", "pct", "La comisión que te cobra la pasarela por cada cobro (ej. 3%).")}
          {f("operacion.gastosAdminMes", "Gastos fijos al mes", "money", "Sueldos, asesoras, herramientas, alquiler… lo que pagas aunque no vendas.")}
        </div>
      ),
    },
    {
      title: "Tu inversión en ads",
      intro: "Ahora el embudo. ¿Cuánto vas a invertir y cuánto cuesta que te vean?",
      body: (
        <div className="flex flex-col gap-4">
          {f(form.funnel === "leads" ? "embudoLeads.inversion" : "embudoMensajes.inversion", "Inversión en publicidad / mes", "money", "Cuánto vas a gastar en anuncios (Facebook/Instagram) en el mes.")}
          {form.funnel === "leads"
            ? f("embudoLeads.cpm", "CPM (costo por mil vistas)", "money", "Lo que cuesta que tu anuncio se muestre 1,000 veces. Lo ves en el administrador de anuncios.")
            : f("embudoMensajes.costoPorMensaje", "Costo por mensaje", "money", "Cuánto te cuesta cada conversación que abre el anuncio.")}
        </div>
      ),
    },
    form.funnel === "leads"
      ? {
          title: "¿Cómo convierte tu tráfico?",
          intro: "De los que ven el anuncio hasta los que compran, la gente se va filtrando. No te preocupes si no sabes los números exactos: los estimados son realistas.",
          body: (
            <div className="flex flex-col gap-4">
              {f("embudoLeads.ctr", "CTR (clics al anuncio)", "pct", "De cada 100 que ven el anuncio, cuántos hacen clic. Entre 2% y 6% es normal.")}
              {f("embudoLeads.velocidadCarga", "Llegan a la página", "pct", "De los que hacen clic, qué % alcanza a ver tu página (no se va por lentitud). 80% es razonable.")}
              {f("embudoLeads.conversionRate", "Tasa de conversión", "pct", "De los que ven tu página, qué % compra. Entre 1% y 3% es típico en e-commerce.")}
            </div>
          ),
        }
      : {
          title: "El cierre de la venta",
          intro: "Del chat a la venta: cuánto cierra tu equipo y cuántos pedidos se pierden.",
          body: (
            <div className="flex flex-col gap-4">
              {f("embudoMensajes.tasaCierre", "Tasa de cierre", "pct", "De cada 100 mensajes, cuántos terminan en venta. Depende de tu equipo de ventas.")}
              {f("embudoMensajes.pctRechazo", "% de rechazo", "pct", "De los pedidos enviados, qué % el cliente rechaza o no recibe.")}
            </div>
          ),
        },
    ...(form.funnel === "leads"
      ? [{
          title: "Entregas (contra entrega)",
          intro: "En contra entrega no todos los pedidos llegan a buen puerto.",
          body: (
            <div className="flex flex-col gap-4">
              {f("embudoLeads.pctConfirmacion", "% que confirma el pedido", "pct", "De las ventas registradas, qué % confirma realmente que quiere el producto.")}
              {f("embudoLeads.pctRechazo", "% de rechazo", "pct", "De los pedidos enviados, qué % el cliente rechaza o no recibe.")}
            </div>
          ),
        }]
      : []),
    {
      title: "Ofertas por cantidad",
      intro: "Muchos venden más de una unidad por pedido (lleva 2, lleva 3…). Repartí a tus compradores entre tus 3 ofertas. Si los % no suman 100%, los ajustamos solos.",
      body: (
        <div className="flex flex-col gap-3">
          {Math.abs(pctOfertas - 1) > 0.001 && (
            <div className="text-[12px] text-[#ff9c4d] bg-[rgba(255,156,77,0.08)] border border-[rgba(255,156,77,0.25)] rounded-lg px-3 py-2">
              Tus % suman {fmtPct(pctOfertas)} — los normalizamos a 100% automáticamente.
            </div>
          )}
          {form.cantidad.map((t, i) => (
            <div key={i} className="rounded-xl border border-white/[0.08] p-3.5">
              <div className="text-[13px] font-semibold text-[#f5f5f5] mb-2.5">Oferta {i + 1}{i === 0 ? " (1 unidad)" : ""}</div>
              <div className="grid grid-cols-3 gap-3">
                {f(`cantidad.${i}.pctCompra`, "% de compradores", "pct", "De tus compradores, qué % elige esta oferta. Las 3 deben sumar 100%.")}
                {f(`cantidad.${i}.precio`, "Precio", "money", "Precio de esta oferta (ej. 'llévate 2 por S/289').")}
                {f(`cantidad.${i}.costo`, "Tu costo", "money", "Lo que te cuesta entregar esta oferta completa.")}
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Upsells (extras)",
      intro: "Productos adicionales que el cliente agrega al pedido. No suman 100%: son un extra encima de la compra principal. Si no usas upsells, deja los % en 0.",
      body: (
        <div className="flex flex-col gap-3">
          {form.upsells.map((t, i) => (
            <div key={i} className="rounded-xl border border-white/[0.08] p-3.5">
              <div className="text-[13px] font-semibold text-[#f5f5f5] mb-2.5">Upsell {i + 1}</div>
              <div className="grid grid-cols-3 gap-3">
                {f(`upsells.${i}.pctCompra`, "% que lo agrega", "pct", "Qué % de tus compradores suma este extra al pedido.")}
                {f(`upsells.${i}.precio`, "Precio", "money", "Precio del extra.")}
                {f(`upsells.${i}.costo`, "Tu costo", "money", "Lo que te cuesta ese extra.")}
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Tus resultados",
      intro: "",
      body: (
        <Dashboard result={result} funnel={form.funnel} exporting={exporting}
          onExport={async () => { setExporting(true); try { await exportarXlsx(form); } finally { setExporting(false); } }} />
      ),
    },
  ];

  const total = steps.length;
  const current = Math.min(step, total - 1);
  const cur = steps[current];
  const isLast = current === total - 1;

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-8 py-3.5 border-b border-white/[0.06] flex items-center gap-2 text-[13px]">
        <Link href="/" className="text-[#8a8a8a] hover:text-[#bdbdbd] no-underline">Herramientas</Link>
        <ChevronRight className="w-3.5 h-3.5 text-[#8a8a8a]" />
        <span className="text-[#f5f5f5] font-semibold">Calculadora de Costos</span>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Panel de preguntas */}
        <div className="flex-1 px-12 py-10 border-r border-white/[0.06] overflow-y-auto">
          {/* Progreso */}
          <div className="max-w-[620px] mb-8">
            <div className="flex items-center justify-between text-[12px] text-[#8a8a8a] mb-2">
              <span>Paso {current + 1} de {total}</span>
              <span>{Math.round(((current + 1) / total) * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full jr-cta transition-all duration-300" style={{ width: `${((current + 1) / total) * 100}%` }} />
            </div>
          </div>

          <div className="max-w-[620px]">
            <h2 className="text-[22px] font-bold text-[#f5f5f5]">{cur.title}</h2>
            {cur.intro && <p className="text-[14px] text-[#8a8a8a] mt-2 mb-6 leading-relaxed">{cur.intro}</p>}
            <div className={cur.intro ? "" : "mt-6"}>{cur.body}</div>
          </div>

          {/* Navegación */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/[0.06] max-w-[620px]">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))}
              className={["flex items-center gap-1.5 border border-white/[0.06] rounded-xl px-5 py-2.5 text-[14px] font-medium", current === 0 ? "opacity-0 pointer-events-none" : "text-[#bdbdbd] hover:text-[#f5f5f5] hover:border-white/[0.18] cursor-pointer"].join(" ")}>
              <ChevronLeft className="w-4 h-4" /> Atrás
            </button>
            {!isLast && (
              <button type="button" onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
                className="flex items-center gap-2 jr-cta text-[14px] font-bold px-7 py-2.5 rounded-xl border-0 cursor-pointer">
                {current === total - 2 ? "Ver resultados" : "Siguiente"} <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Panel de proyección en vivo */}
        <div className="w-[380px] flex-shrink-0 sticky top-0 h-screen overflow-y-auto bg-[#080810] px-7 py-9">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]">Proyección en vivo</div>
          <p className="text-[11px] text-[#6a6a6a] mt-1 leading-snug">Se actualiza con tus datos y los estimados que falten.</p>
          <div className="mt-4 rounded-2xl border border-white/[0.08] p-5">
            <div className="text-[13px] text-[#8a8a8a]">Profit Neto / mes</div>
            <div className="text-[30px] font-bold mt-1" style={{ color: result.pg.profitNeto >= 0 ? accent : "#f87171" }}>
              {fmtMoney(result.pg.profitNeto)}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <Kpi label="Ingresos" value={fmtMoney(result.pg.ingresosTotales)} />
              <Kpi label="Margen Neto" value={fmtPct(result.pg.margenNeto)} />
              <Kpi label="ROI Ads" value={fmtPct(result.pg.roiAds)} />
              <Kpi label="Entregas" value={fmtNum(result.embudo.entregas)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pathGet(obj: any, path: string): number {
  return path.split(".").reduce((o, k) => o?.[k], obj) as number;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[#8a8a8a]">{label}</div>
      <div className="text-[15px] font-semibold text-[#f5f5f5]">{value}</div>
    </div>
  );
}

function Card({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-[#8a8a8a]">
        {label}
        <Help text={help} />
      </div>
      <div className="text-[19px] font-bold text-[#f5f5f5] mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function Dashboard({
  result, funnel, onExport, exporting,
}: {
  result: ReturnType<typeof calcular>; funnel: Funnel; onExport: () => void; exporting: boolean;
}) {
  const { pg, embudo } = result;
  const pn = pg.profitNeto;
  const estado =
    pn < 0
      ? { c: "#f87171", bg: "rgba(248,113,113,0.1)", b: "rgba(248,113,113,0.4)", label: "No rentable", msg: "Con estos números pierdes dinero. Sube el precio, baja costos o mejora la conversión." }
      : pg.margenNeto < 0.1
      ? { c: "#fbbf24", bg: "rgba(251,191,36,0.1)", b: "rgba(251,191,36,0.4)", label: "Rentable pero ajustado", msg: "Ganas, pero con margen delgado. Poco espacio para imprevistos o devoluciones." }
      : { c: "#34d399", bg: "rgba(52,211,153,0.1)", b: "rgba(52,211,153,0.4)", label: "Rentable", msg: "¡Buen margen! Con estos números el negocio se sostiene y deja ganancia." };

  const ing = pg.ingresosTotales || 1;
  const segs = [
    { label: "Costo de producto", val: pg.costoProductoPrincipal + pg.costoProductoOferta, color: "#60a5fa" },
    { label: "Envío y devoluciones", val: pg.costosEnvio + pg.costosDevoluciones, color: "#818cf8" },
    { label: "Empaque", val: pg.costoFullfillment, color: "#a78bfa" },
    { label: "Comisión pasarela", val: pg.comisionPasarela, color: "#f472b6" },
    { label: "Inversión en ads", val: pg.inversionPublicidad, color: "#fb923c" },
    { label: "Gastos fijos", val: pg.gastosFijos, color: "#94a3b8" },
    { label: "Profit neto", val: Math.max(0, pn), color: "#34d399" },
  ].filter((s) => s.val > 0);

  return (
    <div className="flex flex-col gap-7">
      {/* Semáforo + número principal */}
      <div className="rounded-2xl border p-6" style={{ background: estado.bg, borderColor: estado.b }}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: estado.c }} />
          <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: estado.c }}>{estado.label}</span>
        </div>
        <div className="text-[40px] font-bold mt-2 tabular-nums" style={{ color: estado.c }}>{fmtMoney(pn)}</div>
        <div className="text-[13px] text-[#bdbdbd]">Profit neto proyectado al mes</div>
        <p className="text-[13px] text-[#bdbdbd] mt-3 leading-relaxed">{estado.msg}</p>
      </div>

      {/* Rentabilidad */}
      <div>
        <h3 className="text-[14px] font-bold text-[#f5f5f5] mb-3">Rentabilidad</h3>
        <div className="grid grid-cols-3 gap-3">
          <Card label="Margen bruto" value={fmtPct(pg.margenBruto)} help="De cada sol que vendes, cuánto queda después de costos de producto y operación (antes de gastos fijos)." />
          <Card label="Margen neto" value={fmtPct(pg.margenNeto)} help="De cada sol que vendes, cuánto queda como ganancia final (después de TODO)." />
          <Card label="ROI Ads" value={fmtPct(pg.roiAds)} help="Por cada sol invertido en publicidad, cuánto ganas de profit. 100% = duplicas tu inversión." />
          <Card label="ROAS real" value={fmtX(embudo.roasReal)} help="Por cada sol en ads, cuántos soles de venta real generas (ya con entregas)." />
          <Card label="Ticket promedio" value={fmtMoney(pg.aovReal)} help="Cuánto factura en promedio cada cliente que recibe el producto." />
          <Card label="Ingresos / mes" value={fmtMoney(pg.ingresosTotales)} help="Total que facturas en el mes con estas ventas." />
        </div>
      </div>

      {/* Límites */}
      <div>
        <h3 className="text-[14px] font-bold text-[#f5f5f5] mb-3">Tus límites (hasta dónde puedes estirarte)</h3>
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
        <h3 className="text-[14px] font-bold text-[#f5f5f5] mb-3">¿A dónde va cada sol que vendes?</h3>
        <div className="flex h-4 w-full overflow-hidden rounded-full border border-white/[0.08]">
          {segs.map((s) => (
            <div key={s.label} style={{ width: `${(s.val / ing) * 100}%`, background: s.color }} title={`${s.label}: ${fmtMoney(s.val)}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-4">
          {segs.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-2 text-[#bdbdbd]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="text-[#8a8a8a] tabular-nums">{fmtPct(s.val / ing)}</span>
            </div>
          ))}
        </div>
      </div>

      <button type="button" disabled={exporting} onClick={onExport}
        className="self-start flex items-center gap-2 jr-cta text-[14px] font-bold px-6 py-3 rounded-xl border-0 cursor-pointer disabled:opacity-60">
        <Download className="w-4 h-4" />
        {exporting ? "Generando Excel…" : "Exportar análisis a Excel"}
      </button>
    </div>
  );
}
