"use client";

import { useState } from "react";
import { LayoutTemplate, Copy, Check } from "lucide-react";
import { WizardShell } from "@/components/tools/WizardShell";
import { PreviewPanel } from "@/components/tools/PreviewPanel";
import { ChipGroup } from "@/components/tools/ui/ChipGroup";
import { FieldGroup } from "@/components/tools/ui/FieldGroup";

const STEPS = [
  { label: "Tu negocio" },
  { label: "Objetivo de la landing" },
  { label: "Revisar" },
  { label: "Landing lista" },
];

const MOCK_LANDING = [
  {
    section: "HERO",
    content: `Headline: "Aumenta tus ventas online en 90 días o te devolvemos tu inversión"
Subheadline: "El sistema probado que ya usaron más de 500 marcas peruanas para escalar su ecommerce sin complicaciones."
CTA: "Quiero escalar mi tienda ahora →"`,
  },
  {
    section: "PROBLEMA",
    content: `"¿Te identificas con alguno de estos problemas?"
• Inviertes en publicidad pero no ves resultados
• Tu tienda tiene visitas pero pocas ventas
• No sabes qué mejorar para crecer
• Sientes que la competencia te gana`,
  },
  {
    section: "SOLUCIÓN",
    content: `"Con JR Consulting tendrás:"
✦ Estrategia de marketing personalizada para tu negocio
✦ Campañas optimizadas desde el primer día
✦ Seguimiento semanal de resultados
✦ Acceso a herramientas exclusivas de IA`,
  },
  {
    section: "PRUEBA SOCIAL",
    content: `"Lo que dicen nuestros clientes:"
⭐⭐⭐⭐⭐ "Pasé de S/3,000 a S/18,000 en ventas mensuales en 4 meses." — María T., Lima
⭐⭐⭐⭐⭐ "Por fin entiendo mis métricas y sé qué hacer cada semana." — Carlos M., Arequipa`,
  },
  {
    section: "CTA FINAL",
    content: `Headline: "Empieza hoy con una sesión gratuita"
Subheadline: "Sin compromisos. Analizamos tu negocio y te decimos exactamente qué hacer."
Botón: "Reservar mi sesión gratuita →"
Garantía: "100% confidencial · Sin contratos · Solo 5 cupos disponibles esta semana"`,
  },
];

export default function GeneradorLanding() {
  const [negocio, setNegocio] = useState("");
  const [oferta, setOferta] = useState("");
  const [objetivo, setObjetivo] = useState("Generar leads");
  const [secciones, setSecciones] = useState<string[]>(["Hero", "Problema", "Solución"]);
  const [garantia, setGarantia] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  function copySec(sec: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopied(sec);
    setTimeout(() => setCopied(null), 2000);
  }

  const preview = (
    <PreviewPanel
      icon={LayoutTemplate}
      accentColor="#ff9c4d"
      placeholderTitle="Tu landing aparecerá aquí"
      placeholderSub="Genera el copy y estructura de todas las secciones de tu landing page."
      tips={[{ text: <><strong className="text-[#ff9c4d]">Tip:</strong> Las landings con garantía explícita convierten hasta 2× más que las que no la tienen.</> }]}
    />
  );

  return (
    <WizardShell steps={STEPS} preview={preview} toolName="Generador de Landing Pages">
      {({ currentStep }) => (
        <div>
          {currentStep === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Tu negocio</h2>
                <p className="text-[14px] text-[#bdbdbd]">Base para crear el copy de tu landing page.</p>
              </div>
              <FieldGroup type="input" id="negocio" label="Nombre del negocio" required placeholder="Ej: JR Consulting" value={negocio} onChange={setNegocio} />
              <FieldGroup type="textarea" id="oferta" label="¿Qué ofreces exactamente?" required placeholder="Ej: Consultoría de marketing para dueños de ecommerce que quieren aumentar ventas" rows={3} value={oferta} onChange={setOferta} />
              <FieldGroup type="input" id="garantia" label="¿Tienes alguna garantía?" helper="(opcional)" placeholder="Ej: Devolvemos tu inversión si no ves resultados en 90 días" value={garantia} onChange={setGarantia} />
            </div>
          )}

          {currentStep === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Objetivo y secciones</h2>
                <p className="text-[14px] text-[#bdbdbd]">Define qué quieres lograr y qué secciones incluir.</p>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Objetivo principal <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup options={["Generar leads", "Venta directa", "Reservar cita", "Registrar usuarios"]} selected={objetivo} onChange={(v) => setObjetivo(v as string)} />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Secciones a incluir <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup multi options={["Hero", "Problema", "Solución", "Beneficios", "Prueba social", "FAQ", "CTA final"]} selected={secciones} onChange={(v) => setSecciones(v as string[])} />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="flex flex-col gap-5">
              <div><h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Revisa tu configuración</h2></div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3 text-[14px]">
                {[["Negocio", negocio || "—"], ["Oferta", oferta || "—"], ["Garantía", garantia || "Sin garantía"], ["Objetivo", objetivo], ["Secciones", secciones.join(", ") || "—"]].map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-[#8a8a8a] font-semibold min-w-[100px]">{k}:</span><span className="text-[#f5f5f5]">{v}</span></div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">¡Tu landing está lista!</h2>
                <p className="text-[14px] text-[#bdbdbd]">Copy por sección. Copia cada bloque y úsalo en tu página.</p>
              </div>
              <div className="flex flex-col gap-3">
                {MOCK_LANDING.map((sec) => (
                  <div key={sec.section} className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-[#ff9c4d] tracking-[1.5px] uppercase">{sec.section}</span>
                      <button type="button" onClick={() => copySec(sec.section, sec.content)} className="flex items-center gap-1 text-[#8a8a8a] hover:text-[#ff9c4d] text-xs font-medium cursor-pointer bg-transparent border-0 transition-colors duration-200 font-sans">
                        {copied === sec.section ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied === sec.section ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <pre className="text-[13px] text-[#bdbdbd] leading-[1.65] whitespace-pre-wrap font-sans">{sec.content}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </WizardShell>
  );
}
