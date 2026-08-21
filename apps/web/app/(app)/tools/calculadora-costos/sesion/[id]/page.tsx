"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ToolShell from "@/components/tools/ui/ToolShell";
import { calcular, calcularPrecio } from "@/lib/calculadora-costos/model";
import { exportarXlsx, exportarXlsxPrecio } from "@/lib/calculadora-costos/export-xlsx";
import ResultsDashboard, { PrecioDashboard } from "@/components/tools/calculadora-costos/ResultsDashboard";
import { esPrecio, type StoredInputs } from "@/lib/calculadora-costos/stored";

/** Dashboard de una sesión guardada. Las dos hojas comparten pantalla y se distinguen por `kind`. */
export default function CalcDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<{ created_at: string; inputs: StoredInputs } | null | undefined>(undefined);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/calculadora-costos/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setRow)
      .catch(() => setRow(null));
  }, [id]);

  const precio = row?.inputs ? esPrecio(row.inputs) : false;
  const hoja = precio ? "precio" : "rentabilidad";

  async function exportar(fn: () => Promise<void>) {
    setExporting(true);
    setExportError(null);
    try {
      await fn();
    } catch {
      setExportError("No se pudo generar el Excel. Inténtalo de nuevo.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <ToolShell name="Calculadora de Costos" trail="Resumen">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-10 md:px-8">
        {row === undefined && <p className="text-[13px] text-[#a98c88]">Cargando…</p>}
        {row === null && <p className="text-[13px] text-[#a98c88]">No se encontró la sesión.</p>}
        {row && (
          <>
            <div className="mb-7">
              <h1 className="lp-serif text-[26px] leading-tight text-[#f6f2eb]">
                {precio
                  ? "Costeo de producto"
                  : (row.inputs as { funnel: string }).funnel === "leads"
                    ? "Análisis financiero · por leads"
                    : "Análisis financiero · por mensajes"}
              </h1>
              <p className="mt-1 text-[12px] text-[#a98c88]">
                Guardado el{" "}
                {new Date(row.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>

            {esPrecio(row.inputs) ? (
              <PrecioDashboard
                result={calcularPrecio(row.inputs)}
                precioManual={row.inputs.precioManual}
                margenEsperado={row.inputs.margenEsperado}
                onEdit={() => router.push(`/tools/calculadora-costos/${hoja}?sesion=${id}`)}
                exporting={exporting}
                exportError={exportError}
                onExport={() => exportar(() => exportarXlsxPrecio(row.inputs as never))}
              />
            ) : (
              <ResultsDashboard
                result={calcular(row.inputs)}
                funnel={row.inputs.funnel}
                onEdit={() => router.push(`/tools/calculadora-costos/${hoja}?sesion=${id}`)}
                exporting={exporting}
                exportError={exportError}
                onExport={() => exportar(() => exportarXlsx(row.inputs as never))}
              />
            )}
          </>
        )}
      </div>
    </ToolShell>
  );
}
