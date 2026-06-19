"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Sparkles } from "lucide-react";
import { StepIndicator } from "@/components/tools/StepIndicator";
import {
  calcular,
  precioMinimoEstimado,
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

const STEPS = [
  { label: "Tipo" },
  { label: "Costos" },
  { label: "Embudo" },
  { label: "Ofertas" },
  { label: "Resultados" },
];

type Kind = "money" | "pct" | "number";
const accent = "#ff9c4d";

const fmtMoney = (n: number) =>
  "S/ " + (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((Number.isFinite(n) ? n : 0) * 100).toFixed(1) + "%";
const fmtNum = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });

// Campo numérico con badge "estimado" mientras no lo edites. pct se muestra ×100.
function Field({
  label, kind, value, estimated, onChange, hint,
}: {
  label: string; kind: Kind; value: number; estimated: boolean;
  onChange: (n: number) => void; hint?: string;
}) {
  const display = kind === "pct" ? value * 100 : value;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[13px] text-[#bdbdbd]">
        {label}
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
          className="h-9 w-full bg-transparent text-[14px] text-[#f5f5f5] outline-none"
        />
        {kind === "pct" && <span className="text-[13px] text-[#8a8a8a]">%</span>}
      </div>
      {hint && <span className="text-[11px] text-[#6a6a6a]">{hint}</span>}
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
  const mark = (key: string) => setTouched((t) => new Set(t).add(key));

  // setter por path "a.b.0.c"
  function set(path: string, val: number) {
    mark(path);
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

  const op = form.operacion;
  const pctOfertas = form.cantidad.reduce((s, t) => s + t.pctCompra, 0);

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
          <StepIndicator steps={STEPS} currentStep={step} />

          <div className="max-w-[560px]">
            {/* Paso 0: tipo de campaña */}
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <h2 className="text-[20px] font-bold text-[#f5f5f5]">¿Cómo vende tu campaña?</h2>
                <p className="text-[14px] text-[#8a8a8a]">Elige el embudo. Lo demás (costos, ofertas, P&G) es igual.</p>
                {([
                  { f: "leads" as Funnel, t: "Por Leads (web / COD)", d: "Anuncio → landing/formulario → confirmación → entrega. Métricas: CPM, CTR, conversion rate." },
                  { f: "mensajes" as Funnel, t: "Por Mensajes (DM)", d: "Anuncio → mensaje directo → cierre por chat. Métricas: costo por mensaje, tasa de cierre." },
                ]).map(({ f, t, d }) => (
                  <button key={f} type="button" onClick={() => switchFunnel(f)}
                    className={[
                      "text-left rounded-xl border p-4 transition-all",
                      form.funnel === f ? "border-[rgba(255,156,77,0.5)] bg-[rgba(255,156,77,0.06)]" : "border-white/[0.08] hover:border-white/[0.2]",
                    ].join(" ")}>
                    <div className="text-[15px] font-semibold text-[#f5f5f5]">{t}</div>
                    <div className="text-[13px] text-[#8a8a8a] mt-1">{d}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Paso 1: costos de operación */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <h2 className="text-[20px] font-bold text-[#f5f5f5]">Costos de operación</h2>
                <p className="text-[13px] text-[#8a8a8a]">Si no sabes un dato, deja el estimado. Lo puedes ajustar luego.</p>
                <Field label="Precio de venta" kind="money" value={op.precioVenta} estimated={isEst("operacion.precioVenta")} onChange={(n) => set("operacion.precioVenta", n)} />
                <button type="button"
                  onClick={() => set("operacion.precioVenta", precioMinimoEstimado(op, 0.35))}
                  className="self-start flex items-center gap-1.5 text-[12px] text-[#ff9c4d] hover:underline">
                  <Sparkles className="w-3.5 h-3.5" /> No sé mi precio — estímalo (margen 35%)
                </button>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Costo del producto" kind="money" value={op.costoProducto} estimated={isEst("operacion.costoProducto")} onChange={(n) => set("operacion.costoProducto", n)} />
                  <Field label="Flete de envío" kind="money" value={op.flete} estimated={isEst("operacion.flete")} onChange={(n) => set("operacion.flete", n)} />
                  <Field label="Fullfillment" kind="money" value={op.fullfillment} estimated={isEst("operacion.fullfillment")} onChange={(n) => set("operacion.fullfillment", n)} />
                  <Field label="Gastos admin / mes" kind="money" value={op.gastosAdminMes} estimated={isEst("operacion.gastosAdminMes")} onChange={(n) => set("operacion.gastosAdminMes", n)} />
                  <Field label="% compras por pasarela" kind="pct" value={op.pctPasarela} estimated={isEst("operacion.pctPasarela")} onChange={(n) => set("operacion.pctPasarela", n)} />
                  <Field label="Comisión de pasarela" kind="pct" value={op.comisionPasarela} estimated={isEst("operacion.comisionPasarela")} onChange={(n) => set("operacion.comisionPasarela", n)} />
                </div>
              </div>
            )}

            {/* Paso 2: embudo */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <h2 className="text-[20px] font-bold text-[#f5f5f5]">Métricas del embudo</h2>
                {form.funnel === "leads" ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Inversión en ads" kind="money" value={form.embudoLeads!.inversion} estimated={isEst("embudoLeads.inversion")} onChange={(n) => set("embudoLeads.inversion", n)} />
                    <Field label="CPM" kind="money" value={form.embudoLeads!.cpm} estimated={isEst("embudoLeads.cpm")} onChange={(n) => set("embudoLeads.cpm", n)} />
                    <Field label="CTR" kind="pct" value={form.embudoLeads!.ctr} estimated={isEst("embudoLeads.ctr")} onChange={(n) => set("embudoLeads.ctr", n)} />
                    <Field label="Velocidad de carga" kind="pct" value={form.embudoLeads!.velocidadCarga} estimated={isEst("embudoLeads.velocidadCarga")} onChange={(n) => set("embudoLeads.velocidadCarga", n)} />
                    <Field label="Conversion rate" kind="pct" value={form.embudoLeads!.conversionRate} estimated={isEst("embudoLeads.conversionRate")} onChange={(n) => set("embudoLeads.conversionRate", n)} />
                    <Field label="% de confirmación" kind="pct" value={form.embudoLeads!.pctConfirmacion} estimated={isEst("embudoLeads.pctConfirmacion")} onChange={(n) => set("embudoLeads.pctConfirmacion", n)} />
                    <Field label="% de rechazo (no entregados)" kind="pct" value={form.embudoLeads!.pctRechazo} estimated={isEst("embudoLeads.pctRechazo")} onChange={(n) => set("embudoLeads.pctRechazo", n)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Inversión en ads" kind="money" value={form.embudoMensajes!.inversion} estimated={isEst("embudoMensajes.inversion")} onChange={(n) => set("embudoMensajes.inversion", n)} />
                    <Field label="Costo por mensaje" kind="money" value={form.embudoMensajes!.costoPorMensaje} estimated={isEst("embudoMensajes.costoPorMensaje")} onChange={(n) => set("embudoMensajes.costoPorMensaje", n)} />
                    <Field label="Tasa de cierre" kind="pct" value={form.embudoMensajes!.tasaCierre} estimated={isEst("embudoMensajes.tasaCierre")} onChange={(n) => set("embudoMensajes.tasaCierre", n)} />
                    <Field label="% de rechazo (no entregados)" kind="pct" value={form.embudoMensajes!.pctRechazo} estimated={isEst("embudoMensajes.pctRechazo")} onChange={(n) => set("embudoMensajes.pctRechazo", n)} />
                  </div>
                )}
              </div>
            )}

            {/* Paso 3: ofertas + upsells */}
            {step === 3 && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-[20px] font-bold text-[#f5f5f5]">Ofertas por cantidad</h2>
                  <p className="text-[13px] text-[#8a8a8a] mt-1">
                    El % de compra reparte a tus compradores entre las 3 ofertas.{" "}
                    {Math.abs(pctOfertas - 1) > 0.001 && (
                      <span className="text-[#ff9c4d]">Suman {fmtPct(pctOfertas)} — se normalizan a 100% automáticamente.</span>
                    )}
                  </p>
                  {form.cantidad.map((t, i) => (
                    <div key={i} className="grid grid-cols-3 gap-3 mt-3">
                      <Field label={`Oferta ${i + 1} · % compra`} kind="pct" value={t.pctCompra} estimated={isEst(`cantidad.${i}.pctCompra`)} onChange={(n) => set(`cantidad.${i}.pctCompra`, n)} />
                      <Field label="Precio" kind="money" value={t.precio} estimated={isEst(`cantidad.${i}.precio`)} onChange={(n) => set(`cantidad.${i}.precio`, n)} />
                      <Field label="Costo" kind="money" value={t.costo} estimated={isEst(`cantidad.${i}.costo`)} onChange={(n) => set(`cantidad.${i}.costo`, n)} />
                    </div>
                  ))}
                </div>
                <div>
                  <h2 className="text-[20px] font-bold text-[#f5f5f5]">Upsells</h2>
                  <p className="text-[13px] text-[#8a8a8a] mt-1">Tasas de attach independientes (no suman 100%).</p>
                  {form.upsells.map((t, i) => (
                    <div key={i} className="grid grid-cols-3 gap-3 mt-3">
                      <Field label={`Upsell ${i + 1} · % compra`} kind="pct" value={t.pctCompra} estimated={isEst(`upsells.${i}.pctCompra`)} onChange={(n) => set(`upsells.${i}.pctCompra`, n)} />
                      <Field label="Precio" kind="money" value={t.precio} estimated={isEst(`upsells.${i}.precio`)} onChange={(n) => set(`upsells.${i}.precio`, n)} />
                      <Field label="Costo" kind="money" value={t.costo} estimated={isEst(`upsells.${i}.costo`)} onChange={(n) => set(`upsells.${i}.costo`, n)} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paso 4: resultados */}
            {step === 4 && (
              <div className="flex flex-col gap-5">
                <h2 className="text-[20px] font-bold text-[#f5f5f5]">Estado de resultados (P&G)</h2>
                <ResultTable result={result} funnel={form.funnel} />
                <button type="button" disabled={exporting}
                  onClick={async () => { setExporting(true); try { await exportarXlsx(form); } finally { setExporting(false); } }}
                  className="self-start flex items-center gap-2 jr-cta text-[14px] font-bold px-6 py-2.5 rounded-xl border-0 cursor-pointer disabled:opacity-60">
                  <Download className="w-4 h-4" />
                  {exporting ? "Generando…" : "Exportar a Excel"}
                </button>
              </div>
            )}
          </div>

          {/* Navegación */}
          <div className="flex items-center justify-between mt-9 pt-6 border-t border-white/[0.06] max-w-[560px]">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))}
              className={["flex items-center gap-1.5 border border-white/[0.06] rounded-xl px-5 py-2.5 text-[14px] font-medium", step === 0 ? "opacity-0 pointer-events-none" : "text-[#bdbdbd] hover:text-[#f5f5f5] hover:border-white/[0.18] cursor-pointer"].join(" ")}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            {step < STEPS.length - 1 && (
              <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="flex items-center gap-2 jr-cta text-[14px] font-bold px-7 py-2.5 rounded-xl border-0 cursor-pointer">
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Panel de resultados en vivo */}
        <div className="w-[420px] flex-shrink-0 sticky top-0 h-screen overflow-y-auto bg-[#080810] px-7 py-9">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]">Resultado en vivo</div>
          <div className="mt-4 rounded-2xl border border-white/[0.08] p-5">
            <div className="text-[13px] text-[#8a8a8a]">Profit Neto / mes</div>
            <div className="text-[32px] font-bold mt-1" style={{ color: result.pg.profitNeto >= 0 ? accent : "#f87171" }}>
              {fmtMoney(result.pg.profitNeto)}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <Kpi label="Ingresos" value={fmtMoney(result.pg.ingresosTotales)} />
              <Kpi label="Profit Bruto" value={fmtMoney(result.pg.profitBruto)} />
              <Kpi label="Margen Neto" value={fmtPct(result.pg.margenNeto)} />
              <Kpi label="ROI Ads" value={fmtPct(result.pg.roiAds)} />
              <Kpi label="Entregas" value={fmtNum(result.embudo.entregas)} />
              <Kpi label="ROAS Real" value={(result.embudo.roasReal || 0).toFixed(2) + "x"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[#8a8a8a]">{label}</div>
      <div className="text-[15px] font-semibold text-[#f5f5f5]">{value}</div>
    </div>
  );
}

function ResultTable({ result, funnel }: { result: ReturnType<typeof calcular>; funnel: Funnel }) {
  const { pg, embudo } = result;
  const rows: [string, string][] = [
    ["Ingresos totales", fmtMoney(pg.ingresosTotales)],
    ["Costos de intermediación", fmtMoney(pg.costosIntermediacion)],
    ["Comisión de pasarela", fmtMoney(pg.comisionPasarela)],
    ["Inversión en publicidad", fmtMoney(pg.inversionPublicidad)],
    ["— Profit Bruto", fmtMoney(pg.profitBruto)],
    ["Gastos fijos / admin", fmtMoney(pg.gastosFijos)],
    ["— Profit Neto", fmtMoney(pg.profitNeto)],
    ["Margen bruto", fmtPct(pg.margenBruto)],
    ["Margen neto", fmtPct(pg.margenNeto)],
    ["ROI Ads", fmtPct(pg.roiAds)],
    ["AOV real", fmtMoney(pg.aovReal)],
    ["CPA máximo", fmtMoney(pg.cpaMaximo)],
    ["ROAS mínimo", (pg.roasMinimo || 0).toFixed(2) + "x"],
    [`Capital mínimo (ciclo ${funnel === "leads" ? "quincenal" : "semanal"})`, fmtMoney(pg.capitalMinimo)],
    ["Ventas (embudo)", fmtNum(embudo.ventas)],
    ["Entregas efectivas", fmtNum(embudo.entregas)],
    ["CPA real", fmtMoney(embudo.cpaReal)],
  ];
  return (
    <div className="rounded-xl border border-white/[0.08] divide-y divide-white/[0.06]">
      {rows.map(([k, v]) => {
        const head = k.startsWith("—");
        return (
          <div key={k} className={["flex items-center justify-between px-4 py-2.5", head ? "bg-white/[0.03]" : ""].join(" ")}>
            <span className={["text-[13px]", head ? "font-bold text-[#f5f5f5]" : "text-[#bdbdbd]"].join(" ")}>{k.replace("— ", "")}</span>
            <span className={["text-[14px] tabular-nums", head ? "font-bold text-[#ff9c4d]" : "text-[#f5f5f5]"].join(" ")}>{v}</span>
          </div>
        );
      })}
    </div>
  );
}
