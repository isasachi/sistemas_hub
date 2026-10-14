"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/landing";

// La v2 (wizard o chat sobre el sistema de art direction + CRO) convive con el wizard anterior
// hasta que se valide; la anterior queda como segunda opción.
export default function GeneradorLanding() {
  return (
    <ToolIntro
      name="Generador de Landing"
      slug="generador-landing"
      sessionKey={SESSION_KEY}
      title="Generador de Landing"
      description="Cuéntanos qué vendes, comparte tu investigación de mercado y la imagen de tu producto. Diseñamos tu landing sección por sección, siguiendo un esqueleto CRO de 14 secciones, y apruebas cada una antes de pasar a la siguiente."
      cta="Crear mi landing"
      question="¿Cómo quieres trabajar?"
      choices={[
        {
          title: "Nueva versión",
          description: "Paso a paso o conversando en un chat. Usamos solo los datos que nos das y validas cada sección.",
          cta: "Crear mi landing",
          href: "/tools/generador-landing/v2",
        },
        {
          title: "Versión anterior",
          description: "El asistente de siempre: brief, fotos, identidad, confianza y las 8 secciones clásicas.",
          cta: "Usar la versión anterior",
          href: "/tools/generador-landing/wizard",
        },
      ]}
    />
  );
}
