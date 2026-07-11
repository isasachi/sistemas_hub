"use client";

import SessionHistory from "@/components/tools/ui/SessionHistory";
import ToolShell from "@/components/tools/ui/ToolShell";
import { SESSION_KEY } from "@/store/branding";

export default function GeneradorBranding() {
  return (
    <ToolShell name="Generador de Branding" slug="generador-branding">
      <SessionHistory slug="generador-branding" sessionKey={SESSION_KEY} />
    </ToolShell>
  );
}
