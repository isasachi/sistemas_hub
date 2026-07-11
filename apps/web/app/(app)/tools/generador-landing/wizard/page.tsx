"use client";

import LandingWizard from "@/components/tools/generador-landing/LandingWizard";
import ToolShell from "@/components/tools/ui/ToolShell";

export default function GeneradorLandingWizard() {
  return (
    <ToolShell name="Generador de Landing" slug="generador-landing" trail="Sesión">
      <LandingWizard />
    </ToolShell>
  );
}
