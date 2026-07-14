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

/**
 * Sneak peek del output de cada tool.
 *  - image      → /public/showcase/<slug>.jpg con skeleton CSS de fallback
 *  - buscador   → mini card de validación (datos de muestra)
 *  - calculadora→ semáforo de rentabilidad + barra "¿a dónde va cada sol?"
 *
 * `ratio` fuerza el formato del frame de imagen (el showcase usa uno uniforme y
 * compacto; la pared del hero deja el formato nativo, más alto). Los mini-renders
 * HTML ignoran `ratio` — tienen su propia altura natural.
 */
export function ToolPreview({ tool, ratio }: { tool: Tool; ratio?: string }) {
  if (tool.preview?.kind === "buscador") return <BuscadorPreview />;
  if (tool.preview?.kind === "calculadora") return <CalculadoraPreview />;
  if (tool.preview?.kind === "image") return <ImagePreview tool={tool} ratio={ratio} />;
  return null;
}

// ── Imagen real con fallback ──────────────────────────────────────
function ImagePreview({ tool, ratio }: { tool: Tool; ratio?: string }) {
  const [failed, setFailed] = useState(false);
  const key = ratio ?? tool.preview?.ratio ?? "4/3";
  const ratioClass = RATIO_CLASS[key] ?? "aspect-[4/3]";
  const Icon = toolIcon(tool.icon);

  return (
    <div
      className={`relative w-full ${ratioClass} overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0d0d]`}
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/showcase/${tool.slug}.jpg`}
          alt={`Ejemplo generado con ${tool.name}`}
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      )}
      {failed && (
        <div
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 jr-shimmer"
        >
          <Icon className="h-8 w-8" style={{ color: ACCENT, opacity: 0.7 }} />
          <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#8a8a8a]">
            Vista previa
          </span>
        </div>
      )}
    </div>
  );
}

// ── Mini card de validación (Buscador) ────────────────────────────
function BuscadorPreview() {
  const metrics = [
    { value: "142", label: "anuncios" },
    { value: "37", label: "días activo" },
    { value: "MX", label: "país", plain: true },
  ];
  return (
    // h-full + flex col: en la card wide del bento se estira a la altura de la
    // fila (header arriba, métricas centradas, footer abajo); en flujo normal
    // conserva su altura natural.
    <div className="flex h-full w-full flex-col rounded-xl border border-white/[0.08] bg-[#0d0d0d] p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold text-[#f5f5f5]">
            Faja moldeadora premium
          </div>
          <div className="text-[11px] text-[#8a8a8a]">@shapefit.pe</div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.5px]"
          style={{
            color: ACCENT,
            background: "rgba(255,156,77,0.10)",
            border: "1px solid rgba(255,156,77,0.25)",
          }}
        >
          Prioridad alta
        </span>
      </div>
      {/* flex-1 en el wrapper (no en el box con borde): al estirarse la card,
          el box de métricas queda compacto y centrado en el espacio sobrante. */}
      <div className="flex flex-1 items-center">
        <div className="grid w-full grid-cols-3 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          {metrics.map((m) => (
            <div key={m.label} className="text-center">
              <div
                className="text-[20px] font-extrabold leading-none readout"
                style={{ color: m.plain ? "#f5f5f5" : ACCENT }}
              >
                {m.value}
              </div>
              <div className="mt-1 text-[10px] text-[#8a8a8a]">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex shrink-0 items-center gap-1.5 text-[11px] text-[#2ccf6f]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#2ccf6f]" aria-hidden />
        Sin competencia pautando en Perú
      </div>
    </div>
  );
}

// ── Semáforo de rentabilidad (Calculadora) ────────────────────────
function CalculadoraPreview() {
  // Segmentos del "¿a dónde va cada sol?" (suman 100).
  const segments = [
    { label: "Producto", pct: 32, color: "#5b6b7f" },
    { label: "Ads", pct: 28, color: "#ff7a2f" },
    { label: "Envío", pct: 12, color: "#8a8a8a" },
    { label: "Comisión", pct: 8, color: "#c04b6b" },
    { label: "Utilidad", pct: 20, color: "#2ccf6f" },
  ];
  return (
    // h-full + flex col: en la card wide del bento se estira a la altura de la
    // fila (header arriba, bloque de barra centrado); en flujo normal conserva
    // su altura natural.
    <div className="flex h-full w-full flex-col rounded-xl border border-white/[0.08] bg-[#0d0d0d] p-4">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <div className="text-[11px] text-[#8a8a8a]">Utilidad neta proyectada</div>
          <div className="mt-0.5 text-[26px] font-bold leading-none readout text-[#2ccf6f]">
            S/ 4,820
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.5px]"
          style={{
            color: "#2ccf6f",
            background: "rgba(44,207,111,0.10)",
            border: "1px solid rgba(44,207,111,0.25)",
          }}
        >
          Rentable
        </span>
      </div>

      {/* flex-1 en el wrapper: al estirarse la card, el bloque de la barra
          queda centrado en el espacio sobrante. */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="mt-4 text-[10px] font-semibold uppercase tracking-[1px] text-[#8a8a8a]">
          ¿A dónde va cada sol?
        </div>
        <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full">
          {segments.map((s) => (
            <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-1 text-[10px] text-[#bdbdbd]">
              <span
                className="h-2 w-2 rounded-[3px]"
                style={{ background: s.color }}
                aria-hidden
              />
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
