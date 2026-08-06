"use client";

import LandingWizard from "@/components/tools/generador-landing/LandingWizard";

// El chrome (volver, riel de pasos, reiniciar) lo trae StepWizard desde adentro:
// una sola barra, sin breadcrumb encima.
export default function GeneradorLandingWizard() {
  return <LandingWizard />;
}
