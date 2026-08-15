"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/video";

export default function GeneradorVideoAds() {
  return (
    <ToolIntro
      name="Generador de Video Ads"
      slug="generador-video-ads"
      sessionKey={SESSION_KEY}
      title="Un video que ya funciona, rehecho con tu producto"
      description="Sube un video de referencia vertical. Lo desglosamos corte por corte —qué se ve, qué se dice, cómo está encuadrado y cuánto dura cada toma— y sacamos el esqueleto de su guión: una plantilla que completas con tu producto, tu ángulo y tu público. Con ese guión renderizamos el video en clips verticales que descargas por separado."
      cta="Analizar mi video"
    />
  );
}
