"use client";

import SessionHistory from "@/components/tools/ui/SessionHistory";
import ToolShell from "@/components/tools/ui/ToolShell";
import { SESSION_KEY } from "@/store/wizard";

export default function GeneradorAnuncios() {
  return (
    <ToolShell name="Generador de Anuncios" slug="generador-anuncios">
      <SessionHistory slug="generador-anuncios" sessionKey={SESSION_KEY} />
    </ToolShell>
  );
}
