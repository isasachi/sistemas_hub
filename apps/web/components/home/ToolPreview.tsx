"use client";

import { useState } from "react";
import type { Tool } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";

const ACCENT = "#ff9c4d";

const RATIO_CLASS: Record<string, string> = {
  "9/16": "aspect-[9/16]",
  "1/1": "aspect-square",
  "4/3": "aspect-[4/3]",
  "16/10": "aspect-[16/10]",
};

// Metadata mono de esquina por tool (spec-labels del sistema): el lado
// izquierdo nombra el tipo de output, el derecho es un dato real de la tool.
const SPEC_META: Record<string, [string, string]> = {
  "buscador-productos": ["Meta Ads", "5 países"],
  "generador-anuncios": ["Anuncio 9:16", "~40s"],
  "generador-branding": ["Kit de marca", "4 logos"],
  "generador-landing": ["Landing", "8 secciones"],
  "calculadora-costos": ["P&G", "Excel"],
};

/**
 * Sneak peek del output de cada tool: imagen real generada con Gemini
 * (/public/showcase/<slug>.jpg, asset del sistema de diseño) dentro del
 * marco "spec-card": panel anidado + metadata mono en las esquinas.
 *
 * `ratio` fuerza el formato del frame (el showcase usa uno uniforme y
 * compacto; la pared del hero fija alto/ancho por wrapper). Si la imagen
 * falta, cae a un skeleton shimmer con el icono de la tool.
 */
export function ToolPreview({ tool, ratio }: { tool: Tool; ratio?: string }) {
  const [failed, setFailed] = useState(false);
  const ratioClass = RATIO_CLASS[ratio ?? tool.preview?.ratio ?? ""] ?? "";
  const [metaLeft, metaRight] = SPEC_META[tool.slug] ?? ["JR AI Hub", "IA"];
  const Icon = toolIcon(tool.icon);

  return (
    <div
      className={`jr-inset relative h-full w-full overflow-hidden rounded-2xl ${ratioClass}`}
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/showcase/${tool.slug}.jpg`}
          alt={`Ejemplo generado con ${tool.name}`}
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <div
          aria-hidden
          className="jr-shimmer absolute inset-0 flex flex-col items-center justify-center gap-2"
        >
          <Icon className="h-8 w-8" style={{ color: ACCENT, opacity: 0.7 }} />
          <span className="spec-label !text-[10px]">Vista previa</span>
        </div>
      )}

      {/* Metadata mono de esquina sobre un scrim sutil (firma del sistema) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-10"
        style={{
          background:
            "linear-gradient(to bottom, rgba(18,16,13,0.65) 0%, transparent 100%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3.5 pt-2.5">
        <span className="spec-label !text-[#a8a094]">{metaLeft}</span>
        <span className="spec-label !text-[#a8a094]">{metaRight}</span>
      </div>
    </div>
  );
}
