"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/wizard";

export default function GeneradorAnuncios() {
  return (
    <ToolIntro
      name="Generador de Anuncios"
      slug="generador-anuncios"
      sessionKey={SESSION_KEY}
      title="Genera anuncios ganadores"
      description="Sube el anuncio que quieres replicar y una foto de tu producto. Analizamos qué hace que funcione, adaptamos su estructura y mensaje a tu oferta y generamos la nueva creatividad lista para pautar."
      cta="Crear mi anuncio"
    />
  );
}
