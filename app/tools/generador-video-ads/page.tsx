"use client";

import { useState } from "react";
import { Video, Copy, Check } from "lucide-react";
import { WizardShell } from "@/components/tools/WizardShell";
import { PreviewPanel } from "@/components/tools/PreviewPanel";
import { ChipGroup } from "@/components/tools/ui/ChipGroup";
import { FieldGroup } from "@/components/tools/ui/FieldGroup";

const STEPS = [
  { label: "Tu negocio" },
  { label: "Formato del video" },
  { label: "Revisar" },
  { label: "Script listo" },
];

const MOCK_SCRIPT = `🎬 SCRIPT — Video Ad 30s (TikTok/Reels)

[0–3s] GANCHO
"¿Sabías que el 80% de tiendas online falla en su primer año? Nosotros te enseñamos cómo no serlo."

[3–12s] PROBLEMA → SOLUCIÓN
"Si llevas meses sin ver resultados en tu tienda, el problema no eres tú. Es la estrategia. En JR Consulting hemos ayudado a más de 500 marcas peruanas a triplicar sus ventas en 90 días."

[12–22s] PRUEBA SOCIAL / DEMO
[Mostrar capturas de dashboards, testimonios de clientes]
"Mira los resultados reales de nuestros clientes…"

[22–28s] OFERTA + URGENCIA
"Hoy tienes 20% de descuento en tu primera asesoría. Solo por esta semana."

[28–30s] CTA CLARO
"Haz clic en el enlace 👇 y reserva tu sesión gratuita ahora."

#Tags: #ecommerce #peru #marketing #ventas`;

export default function GeneradorVideoAds() {
  const [negocio, setNegocio] = useState("");
  const [producto, setProducto] = useState("");
  const [duracion, setDuracion] = useState("30 segundos");
  const [plataforma, setPlataforma] = useState("TikTok");
  const [estilo, setEstilo] = useState("Educativo");
  const [cta, setCta] = useState("");
  const [copied, setCopied] = useState(false);

  function copyScript() {
    navigator.clipboard.writeText(MOCK_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const preview = (
    <PreviewPanel
      icon={Video}
      accentColor="#ff9c4d"
      placeholderTitle="Tu script aparecerá aquí"
      placeholderSub="Completa los pasos para generar el script estructurado de tu video ad."
      tips={[{ text: <><strong className="text-[#ff9c4d]">Tip:</strong> Los primeros 3 segundos son críticos — el gancho define si el usuario sigue viendo o no.</> }]}
    />
  );

  return (
    <WizardShell steps={STEPS} preview={preview} toolName="Generador de Video Ads">
      {({ currentStep }) => (
        <div>
          {currentStep === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Tu negocio</h2>
                <p className="text-[14px] text-[#bdbdbd]">Base para crear el script de tu video publicitario.</p>
              </div>
              <FieldGroup type="input" id="negocio" label="Nombre del negocio" required placeholder="Ej: SportMax Perú" value={negocio} onChange={setNegocio} />
              <FieldGroup type="textarea" id="producto" label="¿Qué ofreces?" required placeholder="Ej: Consultoría de marketing para ecommerce" rows={3} value={producto} onChange={setProducto} />
            </div>
          )}

          {currentStep === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Formato del video</h2>
                <p className="text-[14px] text-[#bdbdbd]">Define cómo será tu video ad.</p>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Plataforma <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup options={["TikTok", "Instagram Reels", "Facebook", "YouTube Shorts"]} selected={plataforma} onChange={(v) => setPlataforma(v as string)} />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Duración <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup options={["15 segundos", "30 segundos", "60 segundos"]} selected={duracion} onChange={(v) => setDuracion(v as string)} />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#f5f5f5] mb-1 block">Estilo del video <span className="text-[#ff9c4d]">*</span></label>
                <ChipGroup options={["Educativo", "Testimonial", "Demostración", "Storytelling", "Directo"]} selected={estilo} onChange={(v) => setEstilo(v as string)} />
              </div>
              <FieldGroup type="input" id="cta" label="Call to action final" helper="(opcional)" placeholder="Ej: Reserva tu sesión gratis hoy" value={cta} onChange={setCta} />
            </div>
          )}

          {currentStep === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">Revisa tu configuración</h2>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3 text-[14px]">
                {[["Negocio", negocio || "—"], ["Producto", producto || "—"], ["Plataforma", plataforma], ["Duración", duracion], ["Estilo", estilo], ["CTA", cta || "—"]].map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-[#8a8a8a] font-semibold min-w-[100px]">{k}:</span><span className="text-[#f5f5f5]">{v}</span></div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-[22px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] mb-1">¡Script generado!</h2>
                <p className="text-[14px] text-[#bdbdbd]">Estructura lista para grabar. Adapta los textos en corchetes a tu producción.</p>
              </div>
              <div className="relative bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
                <button type="button" onClick={copyScript} className="absolute top-4 right-4 flex items-center gap-1 text-[#8a8a8a] hover:text-[#ff9c4d] text-xs font-medium cursor-pointer bg-transparent border-0 transition-colors duration-200 font-sans">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
                <pre className="text-[13px] text-[#bdbdbd] leading-[1.7] whitespace-pre-wrap font-sans">{MOCK_SCRIPT}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </WizardShell>
  );
}
