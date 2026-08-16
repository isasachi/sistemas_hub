"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import StepWizard from "@/components/tools/ui/StepWizard";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import {
  calcular,
  precioSugerido,
  type CalcInputs,
  type Funnel,
} from "@/lib/calculadora-costos/model";
import { exportarXlsx } from "@/lib/calculadora-costos/export-xlsx";
import ResultsDashboard, { Help, Kpi, fmtMoney, fmtPct, fmtNum } from "@/components/tools/calculadora-costos/ResultsDashboard";
import BackToDashboard from "@/components/tools/ui/BackToDashboard";

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

// Campo numérico con leyenda (tooltip) y marca "estimado" mientras no lo edites.
// La marca es neutra a propósito: hay hasta 9 campos por pantalla y en cálido
// competirían con el único botón de acción.
function Field({
  label, kind, value, estimated, onChange, help,
}: {
  label: string; kind: Kind; value: number; estimated: boolean;
  onChange: (n: number) => void; help: string;
}) {
  const display = kind === "pct" ? value * 100 : value;
  return (
    <label className="flex flex-col gap-1.5 justify-between">
      <span className="flex items-center gap-1.5 text-[13px] text-[#cfcfcf]">
        {label}
        <Help text={help} />
        {estimated && (
          <span className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-sans text-[10px] font-medium uppercase tracking-[0.06em] text-[#bebebe]">
            estimado
          </span>
        )}
      </span>
      <div className="jr-field flex items-center gap-1.5 rounded-lg px-2.5">
        {kind === "money" && <span className="text-[13px] text-[#bebebe]">S/</span>}
        <input
          type="number"
          step="any"
          value={Number.isFinite(display) ? +display.toFixed(4) : ""}
          onChange={(e) => onChange(kind === "pct" ? Number(e.target.value) / 100 : Number(e.target.value))}
          className="h-10 w-full bg-transparent text-[15px] text-[#ededed] outline-none"
        />
        {kind === "pct" && <span className="text-[13px] text-[#bebebe]">%</span>}
      </div>
    </label>
  );
}

function CalculadoraWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CalcInputs>(structuredClone(DEFAULTS.leads));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [calcId, setCalcId] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // gate el auto-save hasta resolver el resume

  const result = useMemo(() => calcular(form), [form]);
  const isEst = (key: string) => !touched.has(key);

  // Reanudar por ?sesion=<id>: carga los inputs guardados y salta a resultados.
  useEffect(() => {
    let cancelled = false;
    const sid = searchParams.get("sesion");
    if (!sid) { setReady(true); return; }
    fetch(`/api/calculadora-costos/sessions/${sid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.inputs) {
          setForm(d.inputs);
          setCalcId(sid);
          setStep(999); // clamp al último paso (resultados)
        }
      })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [searchParams]);

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

  // Reinicia el wizard de cero: descarta la sesión guardada (calcId + ?sesion=)
  // y vuelve a los defaults del primer funnel. Clickeable en cualquier paso.
  function resetSession() {
    setForm(structuredClone(DEFAULTS.leads));
    setTouched(new Set());
    setStep(0);
    setCalcId(null);
    setExporting(false);
    setExportError(null);
    router.replace("/tools/calculadora-costos/wizard");
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
  const steps: { label: string; title: string; intro: string; body: React.ReactNode }[] = [
    {
      label: "Modelo", title: "¿Cómo vendes?",
      intro: "Lo primero: cuéntanos cómo llega la venta. El resto del cálculo es igual para ambos.",
      body: (
        <div className="flex flex-col gap-3">
          {([
            { f: "leads" as Funnel, t: "Por Leads (web / contra entrega)", d: "Tu anuncio lleva a una página o formulario, el cliente deja sus datos y pagas/cobras al entregar." },
            { f: "mensajes" as Funnel, t: "Por Mensajes (chat / DM)", d: "Tu anuncio abre un chat de WhatsApp/Instagram y tu equipo cierra la venta conversando." },
          ]).map(({ f: ff, t, d }) => (
            <button key={ff} type="button" onClick={() => switchFunnel(ff)}
              className={[
                "text-left rounded-xl border p-4 transition-all",
                form.funnel === ff ? "border-[rgba(255,155,74,0.5)] bg-[rgba(255,155,74,0.06)]" : "border-white/[0.08] hover:border-white/[0.2]",
              ].join(" ")}>
              <div className="text-[15px] font-semibold text-[#ededed]">{t}</div>
              <div className="text-[13px] text-[#bebebe] mt-1 leading-relaxed">{d}</div>
            </button>
          ))}
        </div>
      ),
    },
    {
      label: "Producto", title: "Tu producto",
      intro: "Empecemos por lo más simple: a cuánto lo vendes y cuánto te cuesta a ti.",
      body: (
        <div className="flex flex-col gap-4">
          {f("operacion.precioVenta", "Precio de venta", "money", "El precio al que le vendes una unidad a tu cliente final.")}
          <button type="button" onClick={() => set("operacion.precioVenta", precioSugerido(op, 0.35, result.embudo.cpaReal))}
            className="self-start flex items-center gap-1.5 border-0 bg-transparent p-0 text-left font-sans text-[12px] text-[#cfcfcf] transition-colors hover:text-[#ffffff] cursor-pointer">
            <Sparkles className="w-3.5 h-3.5 text-[#d6a860]" /> <span className="underline underline-offset-2 decoration-white/20">Sugerir un precio</span> — cubre costos + ads con 35% de margen
          </button>
          {f("operacion.costoProducto", "Costo del producto", "money", "Lo que te cuesta a ti comprar o producir una unidad.")}
        </div>
      ),
    },
    {
      label: "Entrega", title: "Costo de cada entrega",
      intro: "Cada pedido que mandas tiene gastos de envío y de preparación.",
      body: (
        <div className="flex flex-col gap-4">
          {f("operacion.flete", "Flete de envío", "money", "Cuánto pagas por enviar un pedido al cliente (courier/delivery).")}
          {f("operacion.fullfillment", "Empaque / preparación", "money", "Costo de empacar y alistar cada pedido (almacén, manipuleo).")}
        </div>
      ),
    },
    {
      label: "Fijos", title: "Cobros y gastos fijos",
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
      label: "Ads", title: "Tu inversión en ads",
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
          label: "Conversión", title: "¿Cómo convierte tu tráfico?",
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
          label: "Cierre", title: "El cierre de la venta",
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
          label: "Entregas", title: "Entregas (contra entrega)",
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
      label: "Ofertas", title: "Ofertas por cantidad",
      intro: "Muchos venden más de una unidad por pedido (lleva 2, lleva 3…). Reparte a tus compradores entre tus 3 ofertas. Los 3 % deben sumar 100%.",
      body: (
        <div className="flex flex-col gap-3">
          {Math.abs(pctOfertas - 1) > 0.001 && (
            <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[12px] text-[#cfcfcf]">
              Tus % suman {fmtPct(pctOfertas)}, no 100%. {pctOfertas < 1 ? "Estás dejando compradores sin oferta, así que las ventas salen más bajas de lo real." : "Estás contando más compradores de los que tienes, así que las ventas salen infladas."}
            </div>
          )}
          {form.cantidad.map((t, i) => (
            <div key={i} className="rounded-xl border border-white/[0.08] p-3.5">
              <div className="text-[13px] font-semibold text-[#ededed] mb-2.5">Oferta {i + 1}{i === 0 ? " (1 unidad)" : ""}</div>
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
      label: "Upsells", title: "Upsells (extras)",
      intro: "Productos adicionales que el cliente agrega al pedido. No suman 100%: son un extra encima de la compra principal. Si no usas upsells, deja los % en 0.",
      body: (
        <div className="flex flex-col gap-3">
          {form.upsells.map((t, i) => (
            <div key={i} className="rounded-xl border border-white/[0.08] p-3.5">
              <div className="text-[13px] font-semibold text-[#ededed] mb-2.5">Upsell {i + 1}</div>
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
      label: "Resultados", title: "Tus resultados",
      intro: "",
      body: (
        // El botón va acá y no dentro de ResultsDashboard: ese componente también
        // lo renderiza la vista de solo lectura de una sesión, que no es un final.
        <div className="flex flex-col gap-6">
          <ResultsDashboard result={result} funnel={form.funnel} exporting={exporting} exportError={exportError}
            onExport={async () => {
              setExporting(true); setExportError(null);
              try { await exportarXlsx(form); }
              catch { setExportError("No se pudo generar el Excel. Inténtalo de nuevo."); }
              finally { setExporting(false); }
            }} />
          <BackToDashboard className="self-start" />
        </div>
      ),
    },
  ];

  const total = steps.length;
  const current = Math.min(step, total - 1);
  const cur = steps[current];
  const isLast = current === total - 1;

  // Auto-save al llegar a resultados (crea la sesión o re-guarda si ya existe). Silencioso.
  useEffect(() => {
    if (!ready || !isLast) return;
    const snapshot = {
      funnel: form.funnel,
      precioVenta: form.operacion.precioVenta,
      profitNeto: result.pg.profitNeto,
      margenNeto: result.pg.margenNeto,
      roiAds: result.pg.roiAds,
    };
    const url = calcId ? `/api/calculadora-costos/sessions/${calcId}` : `/api/calculadora-costos/sessions`;
    fetch(url, {
      method: calcId ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: form, snapshot }),
    })
      .then((r) => (r.ok && !calcId ? r.json() : null))
      .then((d) => { if (d?.id) setCalcId(d.id); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLast, ready]);

  return (
    <StepWizard
      steps={steps.map((s) => ({ label: s.label, title: s.title, hint: s.intro || undefined }))}
      current={current}
      // Sin LLM de por medio: todos los pasos quedan libres de recorrer.
      maxReached={total - 1}
      onNavigate={setStep}
      backHref="/tools/calculadora-costos"
      onBack={() => setStep((s) => Math.max(0, s - 1))}
      onReset={resetSession}
      full
    >
      <div className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-8 px-5 pb-16 md:px-8 lg:flex-row lg:items-start lg:gap-10">
        {/* Preguntas */}
        <div className="min-w-0 flex-1">
          {cur.body}

          {!isLast && (
            <div className="mt-10 border-t border-white/[0.06] pt-6">
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
                className="jr-cta h-12 rounded-xl px-7 text-[14px] cursor-pointer"
              >
                {current === total - 2 ? "Ver resultados" : "Siguiente"}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Proyección en vivo — el número se mueve con cada tecla */}
        <aside className="w-full shrink-0 lg:sticky lg:top-[76px] lg:w-[340px]">
          <div className="lp-card lp-leak p-5">
            <p className="lp-label relative">Proyección en vivo</p>
            <p className="relative mt-1 text-[12px] leading-snug text-[#bebebe]">
              Se actualiza con tus datos y con los estimados que aún no tocaste.
            </p>
            <div className="relative mt-5 text-[13px] text-[#bebebe]">Utilidad neta / mes</div>
            <div
              className="readout relative mt-0.5 text-[32px] font-semibold"
              style={{ color: result.pg.profitNeto >= 0 ? "#ffffff" : "#e93d3d" }}
            >
              {fmtMoney(result.pg.profitNeto)}
            </div>
            <div className="relative mt-5 grid grid-cols-2 gap-3">
              <Kpi label="Ingresos" value={fmtMoney(result.pg.ingresosTotales)} />
              <Kpi label="Margen neto" value={fmtPct(result.pg.margenNeto)} />
              <Kpi label="ROI Ads" value={fmtPct(result.pg.roiAds)} />
              <Kpi label="Entregas" value={fmtNum(result.embudo.entregas)} />
            </div>
          </div>
        </aside>
      </div>
    </StepWizard>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pathGet(obj: any, path: string): number {
  return path.split(".").reduce((o, k) => o?.[k], obj) as number;
}

export default function CalculadoraCostosWizard() {
  return (
    <Suspense fallback={null}>
      <CalculadoraWizard />
    </Suspense>
  );
}
