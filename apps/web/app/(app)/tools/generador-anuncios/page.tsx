"use client";

import ToolIntro from "@/components/tools/ui/ToolIntro";
import { SESSION_KEY } from "@/store/wizard";

// Dos flujos, y la elección va ANTES de entrar en vez de como primer paso del wizard: son dos
// puntos de partida distintos (tu referencia o nuestra plantilla), no dos ramas de lo mismo.
export default function GeneradorAnuncios() {
  return (
    <ToolIntro
      name="Generador de Anuncios"
      slug="generador-anuncios"
      sessionKey={SESSION_KEY}
      title="Genera anuncios ganadores"
      description="Convertimos un anuncio que ya funciona —el tuyo de referencia o una de nuestras plantillas— en creatividades listas para pautar, con tu producto, tu marca y el lenguaje de tu audiencia."
      cta="Crear mi anuncio"
      question="¿Cómo quieres empezar?"
      choices={[
        {
          title: "Replicar un anuncio",
          description:
            "Sube el anuncio que quieres emular. Leemos su formato, su estilo y cómo está armado, y construimos el tuyo sobre esa base. Un anuncio por sesión.",
          cta: "Subir mi referencia",
          href: "/tools/generador-anuncios/wizard",
        },
        {
          title: "Usar una plantilla",
          description:
            "Elige una de nuestras 8 estructuras probadas y genera varios anuncios de una sola vez: mismo diseño, ideas distintas. Una mini campaña en lugar de una pieza suelta.",
          cta: "Ver las plantillas",
          href: "/tools/generador-anuncios/plantillas",
        },
      ]}
    />
  );
}
