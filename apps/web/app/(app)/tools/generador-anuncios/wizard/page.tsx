"use client";

import AdWizard from "@/components/tools/generador-anuncios/AdWizard";
import ToolShell from "@/components/tools/ui/ToolShell";
import { useWizardStore } from "@/store/wizard";

export default function GeneradorAnunciosWizard() {
  const startNewSession = useWizardStore((s) => s.startNewSession);
  return (
    <ToolShell name="Generador de Anuncios" slug="generador-anuncios" trail="Sesión" onReset={startNewSession}>
      <AdWizard />
    </ToolShell>
  );
}
