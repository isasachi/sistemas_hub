"use client";

import SessionHistory from "@/components/tools/ui/SessionHistory";
import ToolShell from "@/components/tools/ui/ToolShell";
import { SESSION_KEY } from "@/store/landing";

export default function GeneradorLanding() {
  return (
    <ToolShell name="Generador de Landing" slug="generador-landing">
      <SessionHistory slug="generador-landing" sessionKey={SESSION_KEY} />
    </ToolShell>
  );
}
