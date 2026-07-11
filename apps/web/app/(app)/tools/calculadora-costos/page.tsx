"use client";

import SessionHistory from "@/components/tools/ui/SessionHistory";
import ToolShell from "@/components/tools/ui/ToolShell";

export default function CalculadoraCostos() {
  return (
    <ToolShell name="Calculadora de Costos" slug="calculadora-costos">
      <SessionHistory slug="calculadora-costos" />
    </ToolShell>
  );
}
