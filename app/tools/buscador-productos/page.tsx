"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ChevronRight, Search, ExternalLink, TrendingUp, Loader2, PackageSearch } from "lucide-react";
import type { ProductCard, SearchResponse } from "@/lib/product-hunter/types";

const ACCENT = "#2dd4bf";

const PRIORITY_STYLE: Record<string, { label: string; bg: string; border: string; color: string }> = {
  alta: { label: "🔥 Prioridad alta", bg: "rgba(45,212,191,0.1)", border: "rgba(45,212,191,0.25)", color: "#2dd4bf" },
  media: { label: "🟡 Prioridad media", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", color: "#f59e0b" },
  descartado: { label: "Descartado", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)", color: "#94a3b8" },
};

const SCENARIO_TEXT: Record<string, string> = {
  A: "Sin competencia en Perú",
  B: "Competencia baja en Perú",
  C: "Varios competidores en Perú",
  D: "Mercado saturado en Perú",
};

function ProductCardView({ p }: { p: ProductCard }) {
  const prio = PRIORITY_STYLE[p.priority] ?? PRIORITY_STYLE.media;
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-extrabold text-[#f1f5f9] tracking-[-0.3px] leading-tight">{p.productName}</h3>
          <p className="text-[12px] text-[#475569] mt-0.5">{p.advertiserName}</p>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ background: prio.bg, border: `1px solid ${prio.border}`, color: prio.color }}>
          {prio.label}
        </span>
      </div>

      <p className="text-[13px] text-[#94a3b8] leading-[1.6]">{p.whatIs}</p>

      {/* Métricas de validación */}
      <div className="flex gap-3">
        <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
          <div className="text-[20px] font-extrabold" style={{ color: ACCENT }}>{p.adCount}</div>
          <div className="text-[10px] text-[#475569] uppercase tracking-[1px] font-bold">anuncios</div>
        </div>
        <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
          <div className="text-[20px] font-extrabold" style={{ color: ACCENT }}>{p.daysRunning ?? "?"}</div>
          <div className="text-[10px] text-[#475569] uppercase tracking-[1px] font-bold">días activo</div>
        </div>
        <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
          <div className="text-[20px] font-extrabold text-[#f1f5f9]">{p.foundCountry}</div>
          <div className="text-[10px] text-[#475569] uppercase tracking-[1px] font-bold">país</div>
        </div>
      </div>

      {/* Atributos */}
      {p.attributes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.attributes.map((a) => (
            <span key={a} className="text-[11px] text-[#94a3b8] bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded-lg">{a}</span>
          ))}
        </div>
      )}

      {/* Mercado Perú */}
      <div className="bg-white/[0.03] rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <TrendingUp className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          <span className="text-[12px] font-bold text-[#f1f5f9]">{SCENARIO_TEXT[p.peScenario]}</span>
        </div>
        {p.peCompetitors.length > 0 ? (
          <p className="text-[11px] text-[#94a3b8] leading-[1.5]">
            {p.peCompetitors.map((c) => `${c.name} (${c.adCount} ads)`).join(" · ")}
          </p>
        ) : (
          <p className="text-[11px] text-[#94a3b8]">0 competidores directos encontrados en el pool de Perú.</p>
        )}
      </div>

      {/* CTAs */}
      <div className="flex gap-2">
        <a href={p.adUrl} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-bold rounded-xl py-2.5 no-underline transition-opacity hover:opacity-90"
          style={{ background: ACCENT, color: "#04201c" }}>
          Ver anuncio <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <a href={p.pageUrl} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold rounded-xl py-2.5 no-underline border border-white/[0.12] text-[#f1f5f9] transition-colors hover:bg-white/[0.04]">
          Ver todos los anuncios
        </a>
      </div>
    </div>
  );
}

export default function BuscadorProductos() {
  const [niche, setNiche] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const q = niche.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/buscador-productos/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: q }),
      });
      const data = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error en la búsqueda");
      setResult(data);

      // Marcar como vistos los mostrados (se hunden y reaparecen tras 7 días).
      // NO marcamos los bestEffort: son candidatos de relleno (sin ganadores),
      // no hay que "quemarlos" antes de que el análisis los promueva.
      if (data.status === "ready" && !data.bestEffort && data.products.length) {
        fetch("/api/buscador-productos/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: data.products.map((p) => p.id) }),
        }).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [niche]);

  return (
    <div className="min-h-screen flex flex-col bg-[#080810]">
      {/* Breadcrumb */}
      <div className="px-8 py-3.5 border-b border-white/[0.08] flex items-center gap-2 text-[13px]">
        <Link href="/" className="text-[#475569] hover:text-[#94a3b8] transition-colors no-underline">Herramientas</Link>
        <ChevronRight className="w-3.5 h-3.5 text-[#475569]" />
        <span className="text-[#f1f5f9] font-semibold">Buscador de Productos</span>
      </div>

      <main className="flex-1 max-w-[760px] w-full mx-auto px-8 py-10">
        <div className="mb-6">
          <h1 className="text-[26px] font-extrabold text-[#f1f5f9] tracking-[-0.5px] mb-1.5">Buscador de Productos Ganadores</h1>
          <p className="text-[14px] text-[#94a3b8] leading-[1.6]">
            Escribe un nicho (ej: <span className="text-[#f1f5f9]">espalda</span>, <span className="text-[#f1f5f9]">acne</span>, <span className="text-[#f1f5f9]">rodilla</span>) y te mostramos productos validados en LATAM con su situación de competencia en Perú.
          </p>
        </div>

        {/* Search bar */}
        <div className="flex gap-2 mb-8">
          <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4">
            <Search className="w-4 h-4 text-[#475569]" />
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Escribe un nicho..."
              className="flex-1 bg-transparent py-3 text-[14px] text-[#f1f5f9] placeholder:text-[#475569] outline-none"
            />
          </div>
          <button
            onClick={search}
            disabled={loading || !niche.trim()}
            className="px-5 rounded-xl text-[14px] font-bold disabled:opacity-40 transition-opacity flex items-center gap-2"
            style={{ background: ACCENT, color: "#04201c" }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
          </button>
        </div>

        {/* Resultados */}
        {error && (
          <div className="bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-xl p-4 text-[13px] text-[#fca5a5]">{error}</div>
        )}

        {result?.status === "pending" && (
          <div className="text-center py-16">
            <PackageSearch className="w-10 h-10 mx-auto mb-3 text-[#475569]" />
            {result.queued ? (
              <>
                <h3 className="text-[16px] font-bold text-[#f1f5f9] mb-1">Nicho nuevo en cola</h3>
                <p className="text-[13px] text-[#94a3b8] max-w-[380px] mx-auto leading-[1.6]">
                  <span className="text-[#f1f5f9]">{result.niche}</span> es nuevo para nosotros. Ya lo pusimos en cola y el buscador lo está procesando — los primeros resultados suelen estar listos en unas horas. Vuelve más tarde.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-[16px] font-bold text-[#f1f5f9] mb-1">Analizando este nicho</h3>
                <p className="text-[13px] text-[#94a3b8] max-w-[380px] mx-auto leading-[1.6]">
                  Ya tenemos anuncios de <span className="text-[#f1f5f9]">{result.niche}</span> y los estamos analizando. Los productos validados aparecerán acá en breve — vuelve más tarde.
                </p>
              </>
            )}
          </div>
        )}

        {result?.status === "ready" && (
          <div className="flex flex-col gap-4">
            {result.bestEffort && (
              <div className="bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] rounded-xl p-4 text-[13px] text-[#fbbf24] leading-[1.6]">
                Aún no encontramos ganadores validados para este nicho — te mostramos los mejores candidatos disponibles mientras ampliamos la búsqueda a más países y keywords.
              </div>
            )}
            {result.allSeen && !result.bestEffort && (
              <div className="bg-[rgba(45,212,191,0.06)] border border-[rgba(45,212,191,0.18)] rounded-xl p-4 text-[13px] text-[#5eead4] leading-[1.6]">
                Ya viste los ganadores más recientes de este nicho — te re-mostramos los mejores mientras llegan nuevos en las próximas corridas.
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#475569]">
                {result.products.length} productos
                {!result.bestEffort && result.totalUnseen > 0 && ` · ${result.totalUnseen} nuevos para ti`}
              </span>
            </div>
            {result.products.map((p) => <ProductCardView key={p.id} p={p} />)}
          </div>
        )}
      </main>
    </div>
  );
}
