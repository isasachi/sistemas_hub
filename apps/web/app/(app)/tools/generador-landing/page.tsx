"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/landing";

export default function GeneradorLanding() {
  return (
    <ToolIntro
      name="Generador de Landing"
      slug="generador-landing"
      sessionKey={SESSION_KEY}
      title="Tu página de venta en cinco respuestas"
      description="Cuéntanos qué vendes, sube las fotos reales de tu producto y confirma a quién le hablas. De ahí sale la identidad visual — paleta, materiales y talento — y con ella generamos cada sección de la landing como una imagen: coherentes entre sí y listas para descargar y publicar."
      cta="Crear mi landing"
    />
  );
}
