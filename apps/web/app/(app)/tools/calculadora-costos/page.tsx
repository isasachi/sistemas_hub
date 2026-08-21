"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";

export default function CalculadoraCostos() {
  return (
    <ToolIntro
      name="Calculadora de Costos"
      slug="calculadora-costos"
      title="Calculadora de costos"
      description="Las hojas del análisis financiero de e-commerce, con las mismas fórmulas, pero llenables de corrido: escribes tus números y todo se recalcula al instante. Cuando estés conforme, guardas y obtienes tu resumen."
      cta="Empezar"
      question="¿Qué deseas hacer hoy?"
      choices={[
        {
          title: "Establecer mi precio",
          description:
            "Parte de tus costos (mercancía, flete, adquisición y empaque) y obtén el precio mínimo que sostiene el margen que quieres. Prueba también un precio a mano y mira qué utilidad real deja.",
          cta: "Establecer mi precio",
          href: "/tools/calculadora-costos/precio",
        },
        {
          title: "Calcular mi rentabilidad",
          description:
            "El análisis completo: embudo de anuncios, ofertas por cantidad, upsells y el P&G del mes. Descubre tu CPA máximo, tu ROAS mínimo y el capital que necesitas para operar.",
          cta: "Calcular mi rentabilidad",
          href: "/tools/calculadora-costos/rentabilidad",
        },
      ]}
    />
  );
}
