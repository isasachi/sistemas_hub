"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import { calcular, type CalcInputs } from "@/lib/calculadora-costos/model";
import { exportarXlsx } from "@/lib/calculadora-costos/export-xlsx";
import ResultsDashboard from "@/components/tools/calculadora-costos/ResultsDashboard";

export default function CalcDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<{ created_at: string; inputs: CalcInputs } | null | undefined>(undefined);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/calculadora-costos/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setRow)
      .catch(() => setRow(null));
  }, [id]);

  const result = row?.inputs ? calcular(row.inputs) : null;

  return (
    <ToolShell name="Calculadora de Costos" slug="calculadora-costos" trail="Sesión">

      <div className="max-w-[720px] w-full mx-auto px-6 md:px-10 py-10">
        {row === undefined && <p className="text-[13px] text-[#a98c88]">Cargando…</p>}
        {row === null && <p className="text-[13px] text-[#a98c88]">No se encontró la sesión.</p>}
        {row && result && (
          <>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[22px] font-bold text-[#efe7e0]">
                  {row.inputs.funnel === "leads" ? "Cálculo por leads" : "Cálculo por mensajes"}
                </h1>
                <p className="text-[12px] text-[#a98c88] mt-1">
                  {new Date(row.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })} · solo lectura
                </p>
              </div>
              <button
                onClick={() => router.push(`/tools/calculadora-costos/wizard?sesion=${id}`)}
                className="flex items-center gap-2 rounded-xl jr-cta px-4 py-2 text-[13px] font-bold flex-shrink-0"
              >
                <RotateCw className="w-4 h-4" /> Reanudar sesión
              </button>
            </div>

            <ResultsDashboard
              result={result}
              funnel={row.inputs.funnel}
              exporting={exporting}
              exportError={exportError}
              onExport={async () => {
                setExporting(true); setExportError(null);
                try { await exportarXlsx(row.inputs); }
                catch { setExportError("No se pudo generar el Excel. Inténtalo de nuevo."); }
                finally { setExporting(false); }
              }}
            />
          </>
        )}
      </div>
    </ToolShell>
  );
}
