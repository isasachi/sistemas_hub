"use client";

import AdTool from "@/components/tools/generador-anuncios/AdTool";

// Wizard o Chat sobre la misma sesión. El chrome (volver, riel de pasos, selector de vista,
// reiniciar) lo trae cada vista desde adentro: una sola barra, sin breadcrumb encima.
export default function GeneradorAnunciosWizard() {
  return <AdTool />;
}
