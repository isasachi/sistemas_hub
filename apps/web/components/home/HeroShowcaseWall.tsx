import { tools } from "@/lib/tools";
import { ToolPreview } from "./ToolPreview";

// Los tiles del marquee = las tools con sneak peek (assets generados con
// Gemini en el marco spec-card). Todos con la MISMA altura; el ancho lo da
// el formato nativo de cada asset.
const tiles = tools.filter((t) => t.preview);

const TILE_H = 220;
const RATIO_W: Record<string, number> = {
  "9/16": Math.round(TILE_H * (9 / 16)),
  "2/3": Math.round(TILE_H * (2 / 3)),
  "1/1": TILE_H,
  "4/3": Math.round(TILE_H * (4 / 3)),
  "16/10": Math.round(TILE_H * 1.6),
};

export function HeroShowcaseWall() {
  // 4 copias de la lista: el loop desplaza -50% (= 2 copias exactas), y esas
  // 2 copias (~2800px) superan cualquier viewport — sin hueco progresivo a la
  // derecha antes del reinicio. El espaciado va como margen DENTRO de cada
  // item (no gap) para que el -50% caiga exactamente en la costura.
  const loop = [...tiles, ...tiles, ...tiles, ...tiles];

  return (
    <div className="relative w-full overflow-hidden py-2">
      {/* Fades laterales para que los tiles "entren y salgan" */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-gradient-to-r from-[#14050a] to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-gradient-to-l from-[#14050a] to-transparent"
      />

      <div className="jr-marquee flex w-max items-center">
        {loop.map((tool, i) => (
          <div
            key={`${tool.slug}-${i}`}
            className="mr-5 shrink-0"
            style={{
              height: TILE_H,
              width: RATIO_W[tool.preview?.ratio ?? "1/1"] ?? TILE_H,
            }}
            aria-hidden={i >= tiles.length}
          >
            <ToolPreview tool={tool} />
          </div>
        ))}
      </div>
    </div>
  );
}
