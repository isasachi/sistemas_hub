"use client";

import BrandingWizard from "@/components/tools/generador-branding/BrandingWizard";
import ToolShell from "@/components/tools/ui/ToolShell";
import { useBrandingStore } from "@/store/branding";

export default function GeneradorBrandingWizard() {
  const startNewSession = useBrandingStore((s) => s.startNewSession);
  return (
    <ToolShell name="Generador de Branding" slug="generador-branding" trail="Sesión" onReset={startNewSession}>
      <BrandingWizard />
    </ToolShell>
  );
}
