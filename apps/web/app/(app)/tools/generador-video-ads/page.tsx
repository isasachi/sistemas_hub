"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/video";

export default function GeneradorVideoAds() {
  return (
    <ToolIntro
      name="Generador de Video Ads"
      slug="generador-video-ads"
      sessionKey={SESSION_KEY}
      title="El guión de un video que ya funciona, listo para tu producto"
      description="Sube un video de referencia vertical. Lo desglosamos corte por corte —qué se ve, qué se dice, cómo está encuadrado y cuánto dura cada toma— y sacamos el esqueleto de su guión: la plantilla que rellenas con tu producto, tu ángulo y tu público."
      cta="Analizar mi video"
    />
  );
}
