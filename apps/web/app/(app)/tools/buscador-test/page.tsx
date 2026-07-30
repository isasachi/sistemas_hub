"use client";

import { useCallback, useState } from "react";
import { Search, ExternalLink, Loader2 } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import type { RawBucket, RawProductEntry, RawSearchResponse } from "@ph/shared";

const ACCENT = "#ff9c4d";

// Etiquetas locales a propósito: importar VALORES de @ph/shared en un componente
// cliente arrastra db.ts (service role) al bundle del browser. Los tipos sí, que
// se borran al compilar. La verdad de los rangos vive en raw-buckets.ts (server).
const BUCKETS: { id: RawBucket; label: string }[] = [
  { id: "0-50", label: "0 a 50 anuncios" },
  { id: "50-100", label: "50 a 100 anuncios" },
  { id: "100+", label: "100 a más anuncios" },
];

// Tool de TESTEO (temporal): sin reglas, sin LLM, sin stats en pantalla.
// Cada resultado = un anunciante con sus datos básicos y su enlace a la
// biblioteca de anuncios de Meta. El agrupado por rango de anuncios son las
// tres pestañas — el número en sí no se muestra.

function Entry({ p }: { p: RawProductEntry }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-extrabold text-[#f5f5f5] tracking-[-0.2px] leading-tight truncate">
          {p.title || p.advertiser}
        </h3>
        <p className="text-[12px] text-[#8a8a8a] mt-0.5">
          {p.advertiser}{p.country ? ` · ${p.country}` : ""}
        </p>
        {p.body && <p className="text-[12px] text-[#bdbdbd] leading-[1.5] mt-2 line-clamp-2">{p.body}</p>}
      </div>
      <a href={p.adsUrl} target="_blank" rel="noopener noreferrer"
        className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold rounded-xl px-3 py-2 no-underline border border-white/[0.12] text-[#f5f5f5] transition-colors hover:bg-white/[0.04]">
        Ads Library <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

export default function BuscadorTestPage() {
  const [niche, setNiche] = useState("");
  const [bucket, setBucket] = useState<RawBucket>("0-50");
  const [result, setResult] = useState<RawSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (b: RawBucket, offset = 0) => {
    const q = niche.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/buscador-test/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: q, bucket: b, offset }),
      });
      const data = (await res.json()) as RawSearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error en la búsqueda");
      setBucket(b);
      // offset > 0 = "cargar más": se acumulan los resultados.
      setResult((prev) =>
        offset > 0 && prev ? { ...data, products: [...prev.products, ...data.products] } : data,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [niche, loading]);

  return (
    <ToolShell name="Buscador (Test)" slug="buscador-test">
      <main className="flex-1 max-w-[760px] w-full mx-auto px-8 py-10">
        <div className="mb-6">
          <h1 className="text-[26px] font-extrabold text-[#f5f5f5] tracking-[-0.5px] mb-1.5">Buscador (Test)</h1>
          <p className="text-[14px] text-[#bdbdbd] leading-[1.6]">
            Versión de prueba: productos físicos encontrados en Meta Ads Library, agrupados por cantidad de anuncios. Sin filtros de validación.
          </p>
        </div>

        {/* Búsqueda */}
        <div className="flex gap-2 mb-6">
          <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3">
            <Search className="w-4 h-4 text-[#8a8a8a]" />
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") run(bucket); }}
              placeholder="Escribe un nicho (ej: rodilla, acne, espalda)"
              className="flex-1 bg-transparent py-3 text-[14px] text-[#f5f5f5] placeholder:text-[#6b6b6b] outline-none"
            />
          </div>
          <button onClick={() => run(bucket)} disabled={loading}
            className="jr-cta text-[14px] font-bold rounded-xl px-5 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
          </button>
        </div>

        {/* Grupos */}
        <div className="flex gap-2 mb-5">
          {BUCKETS.map((b) => (
            <button key={b.id} onClick={() => run(b.id)} disabled={loading || !niche.trim()}
              className="text-[12px] font-bold rounded-xl px-3 py-2 border transition-colors disabled:opacity-40"
              style={b.id === bucket
                ? { background: "rgba(255,156,77,0.1)", borderColor: "rgba(255,156,77,0.25)", color: ACCENT }
                : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)", color: "#bdbdbd" }}>
              {b.label}
            </button>
          ))}
        </div>

        {error && <p className="text-[13px] text-[#e58d8d] mb-4">{error}</p>}

        {result?.status === "pending" && (
          <p className="text-[13px] text-[#bdbdbd]">
            {result.queued
              ? "Nicho encolado. El scraper lo levanta en la próxima corrida — vuelve a buscar en unos minutos."
              : "Todavía estamos recolectando este nicho."}
          </p>
        )}
        {result?.status === "empty" && (
          <p className="text-[13px] text-[#bdbdbd]">Sin resultados en este grupo. Prueba otro rango de anuncios.</p>
        )}

        {result && result.products.length > 0 && (
          <div className="flex flex-col gap-3">
            {result.products.map((p) => <Entry key={p.id} p={p} />)}
            {result.hasMore && (
              <button onClick={() => run(bucket, result.products.length)} disabled={loading}
                className="text-[13px] font-semibold rounded-xl py-2.5 border border-white/[0.12] text-[#f5f5f5] transition-colors hover:bg-white/[0.04] disabled:opacity-50">
                {loading ? "Cargando…" : "Cargar más"}
              </button>
            )}
          </div>
        )}
      </main>
    </ToolShell>
  );
}
