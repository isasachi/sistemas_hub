"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/video";

export default function GeneradorVideoAds() {
  return (
    <ToolIntro
      name="Generador de Video Ads"
      slug="generador-video-ads"
      sessionKey={SESSION_KEY}
      title="Tu video ad, con guión y actor incluidos"
      description="Empieza con un video que ya funciona, con la foto de tu creador, o déjanos inventarlo. Desglosamos la referencia segundo a segundo, escribimos el guión con tu producto y te devolvemos el video vertical listo para pautar."
      cta="Crear mi video"
    />
  );
}
