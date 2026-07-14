import { tools } from "@/lib/tools";
import { ToolPreview } from "./ToolPreview";

// Los tiles del marquee = las tools con sneak peek (imágenes reales + mini-renders
// HTML). Mezclar ambos tipos asegura que la pared NUNCA se ve vacía aunque falten
// las imágenes de /public/showcase.
const tiles = tools.filter((t) => t.preview);

export function HeroShowcaseWall() {
  // Se renderiza la lista dos veces para el loop continuo del marquee.
  const loop = [...tiles, ...tiles];

  return (
    <div className="relative w-full overflow-hidden py-2">
      {/* Fades laterales para que los tiles "entren y salgan" */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-gradient-to-r from-black to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-gradient-to-l from-black to-transparent"
      />

      <div className="jr-marquee flex w-max items-center gap-5">
        {loop.map((tool, i) => (
          <div key={`${tool.slug}-${i}`} className="w-[210px] shrink-0" aria-hidden={i >= tiles.length}>
            <ToolPreview tool={tool} />
          </div>
        ))}
      </div>
    </div>
  );
}
