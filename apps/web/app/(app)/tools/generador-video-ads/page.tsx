"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/video";

export default function GeneradorVideoAds() {
  return (
    <ToolIntro
      name="Generador de Video Ads"
      slug="generador-video-ads"
      sessionKey={SESSION_KEY}
      title="Generador de videos"
      description="Sube el video que quieres emular y adapta su estructura a tu oferta. Analizamos los cortes, escenas, diálogos, encuadres y tiempos para generar un nuevo guion y recrearlo con tu producto en clips verticales listos para usar."
      cta="Analizar mi video"
    />
  );
}
