"use client";

import AdWizard from "@/components/tools/generador-anuncios/AdWizard";
import ToolShell from "@/components/tools/ui/ToolShell";

export default function GeneradorAnunciosWizard() {
  return (
    <ToolShell name="Generador de Anuncios" slug="generador-anuncios" trail="Sesión">
      <AdWizard />
    </ToolShell>
  );
}
