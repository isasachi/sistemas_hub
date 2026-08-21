"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import { SheetBlock, type SheetRow } from "@/components/tools/calculadora-costos/SheetGrid";
import { calcularPrecio, type PrecioInputs } from "@/lib/calculadora-costos/model";
import { snapshotDe, type PrecioSessionInputs } from "@/lib/calculadora-costos/stored";

/**
 * Hoja "COSTEO DE PRODUCTOS" del archivo maestro, entera en una pantalla y sin pasos:
 * los tres bloques uno al lado del otro, cada rótulo con su casilla, y los totales
 * moviéndose con cada tecla. Al guardar se pasa a la vista de dashboard.
 */

const DEFAULT: PrecioInputs = {
  costoMercancia: 40,
  flete: 13,
  costoCompra: 35,
  fullfillment: 4,
  igv: 0,
  pctPasarela: 0,
  tasaPasarela: 0,
  cuatroXMil: 0.00004,
  margenEsperado: 0.35,
  precioManual: 99,
};

function HojaPrecio() {
  const router = useRouter();
  const params = useSearchParams();
  const sid = params.get("sesion");
  const [f, setF] = useState<PrecioInputs>(DEFAULT);
  const [calcId, setCalcId] = useState<string | null>(sid);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sid) return;
    fetch(`/api/calculadora-costos/sessions/${sid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.inputs?.kind === "precio") setF(d.inputs); })
      .catch(() => {});
  }, [sid]);

  const r = useMemo(() => calcularPrecio(f), [f]);
  const set = (k: keyof PrecioInputs) => (n: number) => setF((p) => ({ ...p, [k]: n }));

  // Bloque 1 — Datos de Operación: todo lo que el usuario escribe.
  const operacion: SheetRow[] = [
    { label: "Costo de la Mercancía Vendida", value: f.costoMercancia, format: "money", onChange: set("costoMercancia") },
    { label: "Flete de Envío", value: f.flete, format: "money", onChange: set("flete") },
    { label: "Costo por Compra Estimado", value: f.costoCompra, format: "money", onChange: set("costoCompra") },
    { label: "Costo del Fullfillment", value: f.fullfillment, format: "money", onChange: set("fullfillment") },
    { label: "IGV", value: f.igv, format: "pct", onChange: set("igv") },
    { label: "% de Compras en Pasarelas", value: f.pctPasarela, format: "pct", onChange: set("pctPasarela") },
    { label: "Tasa Comisión de Pasarela de Pago", value: f.tasaPasarela, format: "pct", onChange: set("tasaPasarela") },
    { label: "4x100", value: f.cuatroXMil, format: "pct", onChange: set("cuatroXMil") },
    { spacer: true },
    { label: "Margen de Ganancia Esperado", value: f.margenEsperado, format: "pct", onChange: set("margenEsperado") },
    { label: "Precio de Venta Mínimo Estimado", value: r.precioMinimo, format: "money", tone: "strong" },
  ];

  // Bloque 2 — Costeo sobre el precio mínimo que sale del margen esperado.
  const costeo: SheetRow[] = [
    { label: "Costo de la Mercancía Vendida", value: f.costoMercancia, format: "money", dim: true },
    { label: "Flete de Envío", value: f.flete, format: "money", dim: true },
    { label: "Costo por Compra Estimado", value: f.costoCompra, format: "money", dim: true },
    { label: "Costo del Fullfillment", value: f.fullfillment, format: "money", dim: true },
    { label: "Costo de Intermediación", value: r.costeo.costoIntermediacion, format: "money", tone: "strong" },
    { label: "% de compras por Pasarelas", value: r.costeo.pctPasarela, format: "pct", dim: true },
    { label: "Comisión de Pasarela de Pago", value: r.costeo.comisionPasarela, format: "money", dim: true },
    { label: "Costos Financieros (4x1000)", value: r.costeo.costosFinancieros, format: "money", dim: true },
    { label: "TOTAL COSTOS", value: r.costeo.totalCostos, format: "money", tone: "strong" },
    { spacer: true },
    { label: "Utilidad Real ( Ingreso Real) x Unidad", value: r.costeo.utilidad, format: "money", tone: "green" },
    { label: "% de Ingreso Real por unidad", value: r.costeo.pctIngreso, format: "pct", tone: "green" },
  ];

  // Bloque 3 — el mismo costeo, pero contra un precio que el usuario fija a mano.
  const manual: SheetRow[] = [
    { label: "Precio de Venta Manual", value: f.precioManual, format: "money", onChange: set("precioManual") },
    { label: "Costo de Intermediación", value: r.manual.costoIntermediacion, format: "money", tone: "strong" },
    { label: "% de compras por Pasarelas", value: r.manual.pctPasarela, format: "pct", dim: true },
    { label: "Tasa Comisión de Pasarela de Pago", value: f.tasaPasarela, format: "pct", dim: true },
    { label: "Comisión de Pasarela de Pago", value: r.manual.comisionPasarela, format: "money", dim: true },
    { label: "Costos Financieros (4x1000)", value: r.manual.costosFinancieros, format: "money", dim: true },
    { label: "TOTAL COSTOS", value: r.manual.totalCostos, format: "money", tone: "strong" },
    { spacer: true },
    {
      label: "Utilidad Real ( Ingreso Real) x Unidad",
      value: r.manual.utilidad,
      format: "money",
      tone: r.manual.utilidad >= 0 ? "green" : "amber",
    },
    {
      label: "% de Ingreso Real por unidad",
      value: r.manual.pctIngreso,
      format: "pct",
      tone: r.manual.pctIngreso >= 0 ? "green" : "amber",
    },
  ];

  async function guardar() {
    setGuardando(true);
    setError(null);
    const inputs: PrecioSessionInputs = { ...f, kind: "precio" };
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
    <ToolShell name="Calculadora de Costos" trail="Costeo de productos">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-5 pb-20 pt-8 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="lp-serif text-[26px] leading-tight text-[#f6f2eb]">Costeo de productos</h1>
            <p className="mt-1 font-[Lato] text-[13px] text-[#c9b4ae]">
              Llena las casillas y mira el precio mínimo y tu utilidad moverse al instante. Cuando
              estés conforme, guarda.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button type="button" onClick={guardar} disabled={guardando} className="jr-cta h-11 rounded-xl px-6 text-[14px] cursor-pointer">
              <Save className="h-4 w-4" />
              {guardando ? "Guardando…" : "Guardar y ver resumen"}
            </button>
            {error && <p role="alert" className="text-[12px] text-[#ff5a3c]">{error}</p>}
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <SheetBlock title="Datos de Operación" rows={operacion} />
          <SheetBlock title="Costeo de producto" rows={costeo} />
          <SheetBlock title="Estableciendo Precio de Venta Manual" rows={manual} />
        </div>

        <p className="max-w-[760px] text-[12px] leading-relaxed text-[#a98c88]">
          El <strong className="text-[#c9b4ae]">Precio de Venta Mínimo Estimado</strong> sale de dividir
          el costo de intermediación entre (1 − margen esperado). La columna de la derecha te deja
          probar un precio a mano y ver qué utilidad real deja esa decisión.
        </p>
      </div>
    </ToolShell>
  );
}

export default function PaginaPrecio() {
  return (
    <Suspense fallback={null}>
      <HojaPrecio />
    </Suspense>
  );
}
