import type { Tool } from "@/lib/tools";

const ACCENT = "#ff9c4d";

const RATIO_CLASS: Record<string, string> = {
  "9/16": "aspect-[9/16]",
  "1/1": "aspect-square",
  "4/3": "aspect-[4/3]",
  "16/10": "aspect-[16/10]",
};

/**
 * Sneak peek del output de cada tool — assets del sistema de diseño.
 * Todos son mini-renders HTML/SVG (no JPGs): comparten el mismo marco
 * "spec-card" (panel anidado + metadata mono en las esquinas, como las
 * cards de la referencia) y por eso la pared/bento se ve simétrica.
 *
 * `ratio` fuerza el formato del frame (el showcase usa uno uniforme y
 * compacto; la pared del hero usa el formato nativo de cada tool). Los
 * renders de buscador/calculadora ignoran `ratio` — altura natural.
 */
export function ToolPreview({ tool, ratio }: { tool: Tool; ratio?: string }) {
  const kind = tool.preview?.kind;
  const ratioClass = RATIO_CLASS[ratio ?? tool.preview?.ratio ?? ""] ?? "";

  if (kind === "anuncio") return <AnuncioPreview ratioClass={ratioClass} />;
  if (kind === "branding") return <BrandingPreview ratioClass={ratioClass} />;
  if (kind === "landing") return <LandingPreview ratioClass={ratioClass} />;
  if (kind === "buscador") return <BuscadorPreview />;
  if (kind === "calculadora") return <CalculadoraPreview />;
  return null;
}

// ── Marco spec-card: panel anidado + metadata mono de esquina ─────
function SpecFrame({
  metaLeft,
  metaRight,
  ratioClass = "",
  children,
}: {
  metaLeft: string;
  metaRight: string;
  ratioClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`jr-inset relative flex h-full w-full flex-col overflow-hidden rounded-2xl ${ratioClass}`}
    >
      <div className="flex shrink-0 items-center justify-between px-3.5 pt-3">
        <span className="spec-label">{metaLeft}</span>
        <span className="spec-label">{metaRight}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

// ── Anuncio (9:16): escena de producto + precio + CTA ─────────────
function AnuncioPreview({ ratioClass }: { ratioClass?: string }) {
  return (
    <SpecFrame metaLeft="Anuncio 9:16" metaRight="~40s" ratioClass={ratioClass}>
      {/* Escena: lavado radial cálido + producto con luz ámbar */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 62%, rgba(255,156,77,0.16) 0%, transparent 70%)",
          }}
        />
        <svg viewBox="0 0 64 100" className="relative h-[72%] max-h-[150px]" aria-hidden>
          <defs>
            <linearGradient id="ad-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8a5a2e" />
              <stop offset="55%" stopColor="#5c3d20" />
              <stop offset="100%" stopColor="#3a2917" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="94" rx="22" ry="4" fill="rgba(0,0,0,0.4)" />
          <rect x="25" y="4" width="14" height="11" rx="2.5" fill="#302a22" />
          <rect x="28.5" y="15" width="7" height="7" fill="#262019" />
          <rect x="13" y="22" width="38" height="68" rx="9" fill="url(#ad-glass)" />
          <rect x="16.5" y="26" width="4" height="58" rx="2" fill="rgba(255,235,210,0.22)" />
          <rect x="20" y="42" width="24" height="24" rx="3.5" fill="#f3efe8" />
          <rect x="24" y="47" width="16" height="2.5" rx="1.25" fill="#26211b" />
          <rect x="26.5" y="52" width="11" height="2" rx="1" fill="#a8a094" />
          <rect x="24" y="58" width="16" height="1.6" rx="0.8" fill="#c9c2b6" />
        </svg>
        <span
          className="readout absolute right-3 top-2 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: ACCENT, color: "#221204" }}
        >
          S/ 89
        </span>
      </div>
      {/* Pie del anuncio: copy skeleton + CTA */}
      <div className="shrink-0 space-y-1.5 px-3.5 pb-3.5">
        <div className="h-[7px] w-3/4 rounded-full bg-[rgba(243,239,232,0.22)]" />
        <div className="h-[7px] w-1/2 rounded-full bg-[rgba(243,239,232,0.10)]" />
        <div
          className="mt-2.5 flex h-7 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: ACCENT, color: "#221204" }}
        >
          Comprar ahora
        </div>
      </div>
    </SpecFrame>
  );
}

// ── Branding (1:1): placa de marca — monograma + paleta ───────────
function BrandingPreview({ ratioClass }: { ratioClass?: string }) {
  const palette = ["#ff9c4d", "#f3efe8", "#8b7cf6", "#2a2620"];
  return (
    <SpecFrame metaLeft="Kit de marca" metaRight="4 logos" ratioClass={ratioClass}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-4 pb-1">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full border"
          style={{
            borderColor: "rgba(255,156,77,0.45)",
            background:
              "radial-gradient(70% 70% at 50% 35%, rgba(255,156,77,0.18) 0%, transparent 75%)",
          }}
        >
          <span
            className="font-display text-[30px] italic leading-none"
            style={{ color: ACCENT }}
          >
            L
          </span>
        </div>
        <span className="font-display text-[17px] tracking-[0.3em] text-[#f3efe8]">
          LUMA
        </span>
        <span className="spec-label">Esencia natural</span>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-2 pb-4">
        {palette.map((c) => (
          <span
            key={c}
            aria-hidden
            className="h-3.5 w-3.5 rounded-full border border-[rgba(255,240,220,0.14)]"
            style={{ background: c }}
          />
        ))}
      </div>
    </SpecFrame>
  );
}

// ── Landing (9:16): wireframe de página en miniatura ──────────────
function LandingPreview({ ratioClass }: { ratioClass?: string }) {
  return (
    <SpecFrame metaLeft="Landing" metaRight="8 secciones" ratioClass={ratioClass}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 pb-3.5 pt-1.5">
        {/* mini navbar */}
        <div className="flex h-6 shrink-0 items-center justify-between rounded-full border border-[rgba(255,240,220,0.08)] bg-[rgba(255,240,220,0.03)] px-2.5">
          <span className="h-1.5 w-6 rounded-full bg-[rgba(243,239,232,0.28)]" />
          <span className="h-3.5 w-9 rounded-full" style={{ background: ACCENT, opacity: 0.9 }} />
        </div>
        {/* hero */}
        <div className="shrink-0 space-y-1.5 pt-1 text-center">
          <div className="font-display text-[15px] leading-tight text-[#f3efe8]">
            Tu piel, renovada
          </div>
          <div className="mx-auto h-[6px] w-4/5 rounded-full bg-[rgba(243,239,232,0.14)]" />
          <div className="mx-auto h-[6px] w-3/5 rounded-full bg-[rgba(243,239,232,0.08)]" />
        </div>
        {/* bloque de imagen */}
        <div
          className="min-h-0 flex-1 rounded-xl border border-[rgba(255,240,220,0.07)]"
          style={{
            background:
              "radial-gradient(80% 80% at 50% 30%, rgba(255,156,77,0.20) 0%, rgba(139,124,246,0.08) 60%, transparent 100%)",
          }}
        />
        {/* CTA + secciones stub */}
        <div
          className="flex h-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
          style={{ background: ACCENT, color: "#221204" }}
        >
          Quiero el mío
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-1.5">
          <div className="h-5 rounded-lg bg-[rgba(255,240,220,0.05)]" />
          <div className="h-5 rounded-lg bg-[rgba(255,240,220,0.05)]" />
        </div>
      </div>
    </SpecFrame>
  );
}

// ── Buscador: mini card de validación (datos de muestra) ──────────
function BuscadorPreview() {
  const metrics = [
    { value: "142", label: "anuncios" },
    { value: "37", label: "días activo" },
    { value: "MX", label: "país", plain: true },
  ];
  return (
    // h-full + flex col: en la card wide del bento se estira a la altura de
    // la fila; en flujo normal conserva su altura natural.
    <SpecFrame metaLeft="Meta Ads" metaRight="5 países">
      <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-2">
        <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-[#f3efe8]">
              Faja moldeadora premium
            </div>
            <div className="text-[11px] text-[#726b60]">@shapefit.pe</div>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.5px]"
            style={{ color: ACCENT, background: "rgba(255,156,77,0.12)" }}
          >
            Prioridad alta
          </span>
        </div>
        <div className="flex flex-1 items-center">
          <div className="grid w-full grid-cols-3 gap-2 rounded-xl border border-[rgba(255,240,220,0.07)] bg-[rgba(20,18,16,0.5)] p-3">
            {metrics.map((m) => (
              <div key={m.label} className="text-center">
                <div
                  className="readout text-[20px] font-bold leading-none"
                  style={{ color: m.plain ? "#f3efe8" : ACCENT }}
                >
                  {m.value}
                </div>
                <div className="mt-1 text-[10px] text-[#726b60]">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex shrink-0 items-center gap-1.5 text-[11px] text-[#4cd07d]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4cd07d]" aria-hidden />
          Sin competencia pautando en Perú
        </div>
      </div>
    </SpecFrame>
  );
}

// ── Calculadora: semáforo de rentabilidad + barra segmentada ──────
function CalculadoraPreview() {
  // Segmentos del "¿a dónde va cada sol?" (suman 100).
  const segments = [
    { label: "Producto", pct: 32, color: "#8b7cf6" },
    { label: "Ads", pct: 28, color: "#ff9c4d" },
    { label: "Envío", pct: 12, color: "#38c8b4" },
    { label: "Comisión", pct: 8, color: "#e0638d" },
    { label: "Utilidad", pct: 20, color: "#4cd07d" },
  ];
  return (
    // h-full + flex col: en la card wide del bento se estira a la altura de
    // la fila; en flujo normal conserva su altura natural.
    <SpecFrame metaLeft="P&G" metaRight="Excel">
      <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-2">
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div>
            <div className="text-[11px] text-[#726b60]">Utilidad neta proyectada</div>
            <div className="readout mt-0.5 text-[26px] font-bold leading-none text-[#4cd07d]">
              S/ 4,820
            </div>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.5px]"
            style={{ color: "#4cd07d", background: "rgba(76,208,125,0.12)" }}
          >
            Rentable
          </span>
        </div>

        {/* flex-1 en el wrapper: al estirarse la card, el bloque de la barra
            queda centrado en el espacio sobrante. */}
        <div className="flex flex-1 flex-col justify-center">
          <div className="spec-label mt-4">¿A dónde va cada sol?</div>
          {/* Barra segmentada con gaps (lenguaje de la referencia) */}
          <div className="mt-2 flex h-2 w-full gap-[3px]">
            {segments.map((s) => (
              <div
                key={s.label}
                className="rounded-full"
                style={{ width: `${s.pct}%`, background: s.color }}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-1 text-[10px] text-[#a8a094]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                {s.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SpecFrame>
  );
}
