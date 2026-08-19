"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/landing";

export default function GeneradorLanding() {
  return (
    <ToolIntro
      name="Generador de Landing"
      slug="generador-landing"
      sessionKey={SESSION_KEY}
      title="Generador de Landing"
      description="Cuéntanos qué vendes, sube las fotos de tu producto y define a quién va dirigido. La herramienta crea una dirección visual para tu marca y genera cada sección de la landing con el mismo estilo, lista para descargar, ordenar y publicar."
      cta="Crear mi landing"
    />
  );
}
