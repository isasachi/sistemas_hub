"use client";

import BrandingWizard from "@/components/tools/generador-branding/BrandingWizard";
import ToolShell from "@/components/tools/ui/ToolShell";

export default function GeneradorBrandingWizard() {
  return (
    <ToolShell name="Generador de Branding" slug="generador-branding" trail="Sesión">
      <BrandingWizard />
    </ToolShell>
  );
}
