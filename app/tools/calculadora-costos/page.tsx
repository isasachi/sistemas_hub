"use client";

import { useState } from "react";
import { DollarSign } from "lucide-react";
import { WizardShell } from "@/components/tools/WizardShell";
import { PreviewPanel } from "@/components/tools/PreviewPanel";
import { ChipGroup } from "@/components/tools/ui/ChipGroup";
import { FieldGroup } from "@/components/tools/ui/FieldGroup";

const STEPS = [
  { label: "Tu campaña" },
  { label: "Presupuesto" },
  { label: "Revisar" },
  { label: "Proyección" },
];

const MOCK_RESULT = {
  presupuestoTotal: "S/ 3,000",
  duracion: "30 días",
  plataforma: "Facebook + Instagram",
  metricas: [
    { label: "Alcance estimado", value: "45,000 – 70,000 personas" },
    { label: "Clics estimados", value: "1,800 – 2,800 clics" },
    { label: "CPC promedio", value: "S/ 1.07 – S/ 1.67" },
    { label: "Conversiones estimadas", value: "90 – 140 ventas" },
    { label: "Costo por conversión", value: "S/ 21 – S/ 33" },
    { label: "ROI proyectado", value: "180% – 280%" },
  ],
  recomendacion:
    "Con un ticket promedio de S/100, este presupuesto puede generar entre S/9,000 y S/14,000 en ventas. Recomendamos destinar el 70% a conversiones y el 30% a retargeting.",
};

export default function CalculadoraCostos() {
  const [objetivo, setObjetivo] = useState("Ventas directas");
  const [plataformas, setPlataformas] = useState<string[]>(["Facebook"]);
  const [presupuesto, setPresupuesto] = useState("");
  const [duracion, setDuracion] = useState("30 días");
  const [ticket, setTicket] = useState("");

  const preview = (
    <PreviewPanel
      icon={DollarSign}
      accentColor="#ff9c4d"
      placeholderTitle="Tu proyección aparecerá aquí"
      placeholderSub="Completa los datos de tu campaña para ver el ROI estimado."
      tips={[{ text: <><strong className="text-[#ff9c4d]">Tip:</strong> Un presupuesto mínimo de S/1,500/mes es lo recomendado para campañas de conversión en Perú.</> }]}
    />
  );

  return (
    <WizardShell steps={STEPS} preview={preview} toolName="Calculadora de Costos">
      {({ currentStep }) => (
        <div>
          {currentStep === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Tu campaña</h2>
                <p className="text-[14px] text-[#bdbdbd]">Define el objetivo y las plataformas de tu campaña.</p>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Objetivo principal <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup options={["Ventas directas", "Generación de leads", "Tráfico web", "Reconocimiento de marca"]} selected={objetivo} onChange={(v) => setObjetivo(v as string)} />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Plataformas <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup multi options={["Facebook", "Instagram", "TikTok", "Google Ads", "YouTube"]} selected={plataformas} onChange={(v) => setPlataformas(v as string[])} />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Duración de campaña <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup options={["7 días", "15 días", "30 días", "60 días", "90 días"]} selected={duracion} onChange={(v) => setDuracion(v as string)} />
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Presupuesto</h2>
                <p className="text-[14px] text-[#bdbdbd]">Indica tu inversión para calcular las métricas esperadas.</p>
              </div>
              <FieldGroup type="input" id="presupuesto" label="Presupuesto total (S/)" required placeholder="Ej: 3000" value={presupuesto} onChange={setPresupuesto} />
              <FieldGroup type="input" id="ticket" label="Precio promedio de tu producto (S/)" helper="(para calcular ROI)" placeholder="Ej: 100" value={ticket} onChange={setTicket} />
            </div>
          )}

          {currentStep === 2 && (
            <div className="flex flex-col gap-5">
              <div><h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Revisa tu configuración</h2></div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3 text-[14px]">
                {[["Objetivo", objetivo], ["Plataformas", plataformas.join(", ")], ["Duración", duracion], ["Presupuesto", presupuesto ? `S/ ${presupuesto}` : "—"], ["Ticket promedio", ticket ? `S/ ${ticket}` : "—"]].map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-[#8a8a8a] font-semibold min-w-[120px]">{k}:</span><span className="text-[#f5f5f5]">{v}</span></div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Proyección de tu campaña</h2>
                <p className="text-[14px] text-[#bdbdbd]">Estimaciones basadas en benchmarks del mercado peruano.</p>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[11px] font-bold text-[#8a8a8a] tracking-[1.5px] uppercase">Resumen</span>
                  <span className="text-[10px] font-bold bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.2)] text-[#ff9c4d] px-2 py-0.5 rounded-full">
                    {MOCK_RESULT.presupuestoTotal} · {MOCK_RESULT.duracion}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {MOCK_RESULT.metricas.map((m) => (
                    <div key={m.label} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
                      <span className="text-[13px] text-[#bdbdbd]">{m.label}</span>
                      <span className="text-[13px] font-bold text-[#f5f5f5]">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[rgba(255,156,77,0.06)] border border-[rgba(255,156,77,0.14)] rounded-2xl p-4">
                <p className="text-[12px] text-[#bdbdbd] leading-[1.6]">
                  <strong className="text-[#ff9c4d]">Recomendación:</strong>{" "}
                  {MOCK_RESULT.recomendacion}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </WizardShell>
  );
}
