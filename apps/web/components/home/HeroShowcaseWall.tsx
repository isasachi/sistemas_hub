import { tools } from "@/lib/tools";
import { ToolPreview } from "./ToolPreview";

// Los tiles del marquee = las tools con sneak peek (spec-cards HTML/SVG del
// sistema — sin imágenes externas, la pared nunca se ve vacía ni asimétrica).
const tiles = tools.filter((t) => t.preview);

export function HeroShowcaseWall() {
  // Se renderiza la lista dos veces para el loop continuo del marquee.
  const loop = [...tiles, ...tiles];

  return (
    <div className="relative w-full overflow-hidden py-2">
      {/* Fades laterales para que los tiles "entren y salgan" */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-gradient-to-r from-[#141210] to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-gradient-to-l from-[#141210] to-transparent"
      />

      <div className="jr-marquee flex w-max items-center gap-5">
        {loop.map((tool, i) => (
          <div key={`${tool.slug}-${i}`} className="w-[200px] shrink-0" aria-hidden={i >= tiles.length}>
            <ToolPreview tool={tool} />
          </div>
        ))}
      </div>
    </div>
  );
}
