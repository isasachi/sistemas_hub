"use client";

import LandingWizard from "@/components/tools/generador-landing/LandingWizard";
import ToolShell from "@/components/tools/ui/ToolShell";
import { useLandingStore } from "@/store/landing";

export default function GeneradorLandingWizard() {
  const startNewSession = useLandingStore((s) => s.startNewSession);
  return (
    <ToolShell name="Generador de Landing" slug="generador-landing" trail="Sesión" onReset={startNewSession}>
      <LandingWizard />
    </ToolShell>
  );
}
