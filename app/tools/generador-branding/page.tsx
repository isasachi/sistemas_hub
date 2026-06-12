"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { WizardShell } from "@/components/tools/WizardShell";
import { PreviewPanel } from "@/components/tools/PreviewPanel";
import { ChipGroup } from "@/components/tools/ui/ChipGroup";
import { FieldGroup } from "@/components/tools/ui/FieldGroup";

const STEPS = [
  { label: "Tu negocio" },
  { label: "Identidad de marca" },
  { label: "Revisar" },
  { label: "Branding listo" },
];

const MOCK_BRANDING = {
  nombre: "FitLife Perú",
  slogan: "Muévete. Crece. Conquista.",
  colores: [
    { name: "Primario", hex: "#F97316", label: "Naranja energía" },
    { name: "Secundario", hex: "#0F172A", label: "Azul noche" },
    { name: "Acento", hex: "#FACC15", label: "Amarillo vitalidad" },
    { name: "Neutro", hex: "#F8FAFC", label: "Blanco limpio" },
  ],
  voz: "Motivacional, directo y cercano. Habla como un coach personal, no como una corporación.",
  tipografia: { titulo: "Montserrat Bold", cuerpo: "Inter Regular" },
  personalidad: ["Energética", "Auténtica", "Motivacional", "Accesible"],
};

export default function GeneradorBranding() {
  const [negocio, setNegocio] = useState("");
  const [rubro, setRubro] = useState("");
  const [valores, setValores] = useState<string[]>([]);
  const [publico, setPublico] = useState("");
  const [estilo, setEstilo] = useState("Moderno");

  const preview = (
    <PreviewPanel
      icon={Sparkles}
      accentColor="#ff9c4d"
      placeholderTitle="Tu branding aparecerá aquí"
      placeholderSub="Genera paleta de colores, naming, tipografía y voz de marca."
      tips={[{ text: <><strong className="text-[#ff9c4d]">Tip:</strong> Un branding consistente genera hasta 3× más reconocimiento de marca en 6 meses.</> }]}
    />
  );

  return (
    <WizardShell steps={STEPS} preview={preview} toolName="Generador de Branding">
      {({ currentStep }) => (
        <div>
          {currentStep === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Tu negocio</h2>
                <p className="text-[14px] text-[#bdbdbd]">Cuéntanos sobre tu empresa para generar una identidad única.</p>
              </div>
              <FieldGroup type="input" id="negocio" label="Nombre actual (o idea de nombre)" required placeholder="Ej: SportFit o aún no tengo nombre" value={negocio} onChange={setNegocio} />
              <FieldGroup type="textarea" id="rubro" label="¿A qué se dedica tu negocio?" required placeholder="Ej: Vendo ropa deportiva para mujeres en Lima" rows={3} value={rubro} onChange={setRubro} />
              <FieldGroup type="textarea" id="publico" label="¿Quién es tu cliente ideal?" required placeholder="Ej: Mujeres de 25-40 años, amantes del fitness" rows={2} value={publico} onChange={setPublico} />
            </div>
          )}

          {currentStep === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Identidad de marca</h2>
                <p className="text-[14px] text-[#bdbdbd]">Define los valores y el estilo visual que quieres proyectar.</p>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Valores de marca <span className="text-[#ff9c4d]">*</span> <span className="text-[#8a8a8a] font-normal">(elige hasta 3)</span></label>
                <ChipGroup multi options={["Confianza", "Innovación", "Energía", "Lujo", "Cercanía", "Sostenibilidad", "Calidad", "Diversión"]} selected={valores} onChange={(v) => setValores(v as string[])} />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Estilo visual <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup options={["Moderno", "Minimalista", "Vibrante", "Elegante", "Juvenil", "Artesanal"]} selected={estilo} onChange={(v) => setEstilo(v as string)} />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="flex flex-col gap-5">
              <div><h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Revisa tu configuración</h2></div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3 text-[14px]">
                {[["Negocio", negocio || "—"], ["Rubro", rubro || "—"], ["Público", publico || "—"], ["Valores", valores.join(", ") || "—"], ["Estilo visual", estilo]].map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-[#8a8a8a] font-semibold min-w-[100px]">{k}:</span><span className="text-[#f5f5f5]">{v}</span></div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">¡Tu branding está listo!</h2>
                <p className="text-[14px] text-[#bdbdbd]">Aquí tienes los elementos clave de la identidad de tu marca.</p>
              </div>

              {/* Nombre y slogan */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-[#8a8a8a] tracking-[1.5px] uppercase mb-3">Nombre y Slogan</p>
                <p className="text-[22px] font-extrabold text-[#f5f5f5] mb-1">{MOCK_BRANDING.nombre}</p>
                <p className="text-[15px] text-[#bdbdbd] italic">"{MOCK_BRANDING.slogan}"</p>
              </div>

              {/* Colores */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-[#8a8a8a] tracking-[1.5px] uppercase mb-3">Paleta de Colores</p>
                <div className="flex flex-col gap-2">
                  {MOCK_BRANDING.colores.map((c) => (
                    <div key={c.hex} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex-shrink-0" style={{ background: c.hex }} />
                      <div>
                        <p className="text-[13px] font-semibold text-[#f5f5f5]">{c.name} — {c.label}</p>
                        <p className="text-[12px] text-[#8a8a8a] font-mono">{c.hex}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voz */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-[#8a8a8a] tracking-[1.5px] uppercase mb-2">Voz de Marca</p>
                <p className="text-[14px] text-[#bdbdbd] leading-[1.6]">{MOCK_BRANDING.voz}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </WizardShell>
  );
}
