"use client";

import AdWizard from "@/components/tools/generador-anuncios/AdWizard";

// El chrome (volver, riel de pasos, reiniciar) lo trae StepWizard desde adentro:
// una sola barra, sin breadcrumb encima.
export default function GeneradorAnunciosWizard() {
  return <AdWizard />;
}
