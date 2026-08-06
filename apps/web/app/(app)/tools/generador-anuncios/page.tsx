"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/wizard";

export default function GeneradorAnuncios() {
  return (
    <ToolIntro
      name="Generador de Anuncios"
      slug="generador-anuncios"
      sessionKey={SESSION_KEY}
      title="Tu anuncio, construido sobre uno que ya funciona"
      description="Sube el anuncio que quieres emular y la foto de tu producto. Leemos su formato, su composición y su lógica persuasiva, escribimos dos versiones de copy con comentarios reales de TikTok, eliges la tuya y te devolvemos la imagen final lista para pautar."
      cta="Crear mi anuncio"
    />
  );
}
