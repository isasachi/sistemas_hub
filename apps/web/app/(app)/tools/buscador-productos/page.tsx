"use client";

import { useCallback, useState } from "react";
import { Search, ExternalLink, Loader2, PackageSearch } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import type { RawProductEntry, RawSearchResponse } from "@ph/shared";

const ACCENT = "#ff9c4d";

// Los productos llegan verificados por las tres reglas del daemon: producto
// físico vendible, agrupado por cantidad de anuncios, y con la mayoría de la
// página del anunciante dedicada a ese mismo producto.

function ProductCard({ p }: { p: RawProductEntry }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-extrabold text-[#f5f5f5] tracking-[-0.2px] leading-tight">
          {p.productName || p.title || p.advertiser}
        </h3>
        <p className="text-[12px] text-[#8a8a8a] mt-0.5">
          {p.advertiser}{p.country ? ` · ${p.country}` : ""}
        </p>
      </div>

      {p.body && (
        <p className="text-[12px] text-[#bdbdbd] leading-[1.5] line-clamp-3">{p.body}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="readout text-[13px] font-extrabold" style={{ color: ACCENT }}>
          {p.adCount.toLocaleString("es-PE")}
          <span className="text-[10px] text-[#8a8a8a] uppercase tracking-[1px] font-bold ml-1.5">
            anuncios
          </span>
        </span>
        <a href={p.adsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] font-bold rounded-xl px-3 py-2 no-underline border border-white/[0.12] text-[#f5f5f5] transition-colors hover:bg-white/[0.04]">
          Ads Library <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

export default function BuscadorProductosPage() {
  const [niche, setNiche] = useState("");
  const [result, setResult] = useState<RawSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const q = niche.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/buscador-productos/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: q }),
      });
      const data = (await res.json()) as RawSearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error en la búsqueda");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [niche, loading]);

  return (
    <ToolShell name="Buscador de Productos" slug="buscador-productos">
      <main className="flex-1 max-w-[1000px] w-full mx-auto px-8 py-10">
        <div className="mb-6">
          <h1 className="text-[26px] font-extrabold text-[#f5f5f5] tracking-[-0.5px] mb-1.5">
            Buscador de Productos
          </h1>
          <p className="text-[14px] text-[#bdbdbd] leading-[1.6]">
            Escribe un nicho (ej: <span className="text-[#f5f5f5]">rodilla</span>,{" "}
            <span className="text-[#f5f5f5]">acne</span>,{" "}
            <span className="text-[#f5f5f5]">collar antipulgas</span>) y te mostramos productos
            físicos que se están pautando, agrupados por cantidad de anuncios activos.
          </p>
        </div>

        <div className="flex gap-2 mb-8">
          <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3">
            <Search className="w-4 h-4 text-[#8a8a8a]" />
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="Escribe un nicho"
              className="flex-1 bg-transparent py-3 text-[14px] text-[#f5f5f5] placeholder:text-[#6b6b6b] outline-none"
            />
          </div>
          <button onClick={search} disabled={loading}
            className="jr-cta text-[14px] font-bold rounded-xl px-6 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
          </button>
        </div>

        {error && <p className="text-[13px] text-[#e58d8d] mb-4">{error}</p>}

        {result?.status === "pending" && (
          <div className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <PackageSearch className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ACCENT }} />
            <p className="text-[13px] text-[#bdbdbd] leading-[1.6]">
              {result.queued
                ? "Es un nicho nuevo: lo encolamos y el scraper lo levanta en la próxima vuelta. Vuelve a buscarlo en unos minutos."
                : "Estamos verificando los productos de este nicho. Vuelve a buscarlo en un rato."}
            </p>
          </div>
        )}

        {result?.status === "empty" && (
          <p className="text-[13px] text-[#bdbdbd]">
            No encontramos productos físicos que cumplan los criterios en este nicho.
          </p>
        )}

        {result?.status === "ready" && result.groups.map((g) => (
          g.products.length > 0 && (
            <section key={g.bucket} className="mb-10">
              <div className="flex items-baseline gap-2.5 mb-3">
                <h2 className="text-[15px] font-extrabold text-[#f5f5f5]">{g.label}</h2>
                <span className="text-[12px] text-[#8a8a8a]">{g.products.length} productos</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.products.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
            </section>
          )
        ))}
      </main>
    </ToolShell>
  );
}
