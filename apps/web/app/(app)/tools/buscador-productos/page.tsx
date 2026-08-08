"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ExternalLink, Loader2, PackageSearch, Flame } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import { RAW_BUCKETS, RAW_BUCKET_LABEL, type RawBucket, type RawProductEntry, type RawSearchResponse } from "@ph/shared";

const ACCENT = "#ff9b4a";

// Chip: mismo botón para las sugerencias de nicho y para el filtro de rango.
function Chip({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="text-[12px] font-bold rounded-full px-3 py-1.5 border transition-colors"
      style={
        active
          ? { borderColor: ACCENT, color: ACCENT, background: `${ACCENT}1a` }
          : { borderColor: "rgba(255,255,255,0.12)", color: "#cfcfcf" }
      }
    >
      {label}
    </button>
  );
}

// Los productos llegan verificados por las tres reglas del daemon: producto
// físico vendible, agrupado por cantidad de anuncios, y con la mayoría de la
// página del anunciante dedicada a ese mismo producto.

function ProductCard({ p }: { p: RawProductEntry }) {
  return (
    <div className="h-full bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-extrabold text-[#ededed] tracking-[-0.2px] leading-tight">
          {p.productName || p.title || p.advertiser}
        </h3>
        <p className="text-[12px] text-[#bebebe] mt-0.5">
          {p.advertiser}{p.country ? ` · ${p.country}` : ""}
        </p>
      </div>

      {p.body && (
        <p className="text-[12px] text-[#cfcfcf] leading-[1.5] line-clamp-3">{p.body}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="readout text-[13px] font-extrabold" style={{ color: ACCENT }}>
          {p.adCount.toLocaleString("es-PE")}
          <span className="text-[10px] text-[#bebebe] uppercase tracking-[1px] font-bold ml-1.5">
            anuncios
          </span>
        </span>
        <a href={p.adsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] font-bold rounded-xl px-3 py-2 no-underline border border-white/[0.12] text-[#ededed] transition-colors hover:bg-white/[0.04]">
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
  const [topPicks, setTopPicks] = useState<RawProductEntry[]>([]);
  const [sugerencias, setSugerencias] = useState<string[]>([]);

  // Lo más pautado del rango más alto, de todos los nichos. Se refresca solo:
  // la ruta lee en vivo lo que el daemon de vigencia acaba de escribir.
  useEffect(() => {
    fetch("/api/buscador-productos/top-picks")
      .then((r) => r.json())
      .then((d: { products?: RawProductEntry[] }) => setTopPicks(d.products ?? []))
      .catch(() => {});
    fetch("/api/buscador-productos/top-niches")
      .then((r) => r.json())
      .then((d: { niches?: string[] }) => setSugerencias(d.niches ?? []))
      .catch(() => {});
  }, []);

  // `q` y `bucket` van por parámetro y no desde el estado: los chips buscan en
  // el mismo click que actualizan el input, y el estado todavía no llegó.
  // bucket null = que el servidor elija el primer rango con stock.
  const search = useCallback(async (q: string, bucket: RawBucket | null) => {
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    // Cambiar de RANGO no borra lo que hay en pantalla: si se limpiara, el filtro
    // desaparecería a media transición y no habría dónde volver a hacer click.
    // Cambiar de NICHO sí limpia. (`q` ya viene normalizado en el refetch de rango.)
    setResult((prev) => (prev?.niche === q ? prev : null));
    try {
      const res = await fetch("/api/buscador-productos/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: q, bucket }),
      });
      const data = (await res.json()) as RawSearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error en la búsqueda");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const buscarNicho = useCallback((q: string) => {
    setNiche(q);
    search(q, null);
  }, [search]);

  // El rango activo lo dicta la respuesta, no el click: sin filtro explícito el
  // servidor autoelige, y el chip encendido tiene que ser el que de verdad salió.
  const grupo = result?.status === "ready" ? result.groups[0] : undefined;

  return (
    <ToolShell name="Buscador de Productos" slug="buscador-productos">
      <main className="flex-1 max-w-[1000px] w-full mx-auto px-8 py-10">
        <div className="mb-6">
          <h1 className="text-[26px] font-extrabold text-[#ededed] tracking-[-0.5px] mb-1.5">
            Buscador de Productos
          </h1>
          <p className="text-[14px] text-[#cfcfcf] leading-[1.6]">
            Escribe un nicho (ej: <span className="text-[#ededed]">rodilla</span>,{" "}
            <span className="text-[#ededed]">acne</span>,{" "}
            <span className="text-[#ededed]">collar antipulgas</span>) y te mostramos productos
            físicos que se están pautando. Se ve un rango de anuncios a la vez — el filtro lo cambia.
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3">
            <Search className="w-4 h-4 text-[#bebebe]" />
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(niche.trim(), null); }}
              placeholder="Escribe un nicho"
              className="flex-1 bg-transparent py-3 text-[14px] text-[#ededed] placeholder:text-[#6b6b6b] outline-none"
            />
          </div>
          <button onClick={() => search(niche.trim(), null)} disabled={loading}
            className="jr-cta text-[14px] font-bold rounded-xl px-6 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
          </button>
        </div>

        {/* Sugerencias: los NICHOS con más productos en la base (no categorías —
            el ranking es por cantidad de entradas, y así salen "cuello" o "cama
            para perros"). Un click y hay resultados garantizados. */}
        {sugerencias.length > 0 && (
          <div className="mb-8">
            <p className="text-[12px] text-[#bebebe] mb-2">Nichos con más productos</p>
            <div className="flex flex-wrap gap-2">
              {sugerencias.map((n) => (
                <Chip key={n} label={n} active={result?.niche === n} onClick={() => buscarNicho(n)} />
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-[13px] text-[#fca5a5] mb-4">{error}</p>}

        {/* Portada: mientras no haya búsqueda, lo más pautado de todo el inventario.
            Con resultados en pantalla desaparece — no compite con lo que se buscó. */}
        {!result && !loading && topPicks.length > 0 && (
          <section className="mb-10">
            <div className="flex items-baseline gap-2.5 mb-1">
              <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[#ededed]">
                <Flame className="w-4 h-4" style={{ color: ACCENT }} /> Top picks
              </h2>
              <span className="text-[12px] text-[#bebebe]">{topPicks.length} productos</span>
            </div>
            <p className="text-[12px] text-[#bebebe] mb-3">
              Los de más anuncios activos del rango más alto (100+), de todos los nichos.
              <span className="text-[#6b6b6b]"> · pasa el cursor para detener la cinta</span>
            </p>
            {/* La lista va DOS veces: la animación desplaza -50%, o sea justo una
                copia, y el salto al reiniciar cae en un punto idéntico. */}
            {/* mask-x-*: laterales difuminados con las utilidades de máscara de
                Tailwind 4. Escrita a mano en globals.css, lightningcss se comía la
                regla entera. */}
            <div className="jr-marquee-hover overflow-hidden -mx-8 px-8 mask-x-from-92% mask-x-to-100%">
              <div className="jr-marquee flex w-max gap-3" style={{ animationDuration: "70s" }}>
                {[...topPicks, ...topPicks].map((p, i) => (
                  <div key={`${p.id}-${i}`} className="w-[300px] shrink-0" aria-hidden={i >= topPicks.length}>
                    <ProductCard p={p} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {result?.status === "pending" && (
          <div className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <PackageSearch className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ACCENT }} />
            <p className="text-[13px] text-[#cfcfcf] leading-[1.6]">
              {result.queued
                ? "Es un nicho nuevo: lo encolamos y el scraper lo levanta en la próxima vuelta. Vuelve a buscarlo en unos minutos."
                : "Estamos verificando los productos de este nicho. Vuelve a buscarlo en un rato."}
            </p>
          </div>
        )}

        {result?.status === "empty" && (
          <p className="text-[13px] text-[#cfcfcf]">
            No encontramos productos físicos que cumplan los criterios en este nicho.
          </p>
        )}

        {/* Un rango a la vez. El filtro se muestra siempre que la búsqueda haya
            salido bien — también con el rango vacío, sino no habría cómo cambiarlo. */}
        {grupo && (
          <section className="mb-10">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[12px] text-[#bebebe] mr-1">Rango de anuncios</span>
              {RAW_BUCKETS.map((b) => (
                <Chip
                  key={b}
                  label={RAW_BUCKET_LABEL[b]}
                  active={grupo.bucket === b}
                  onClick={() => search(result!.niche, b)}
                />
              ))}
            </div>

            {grupo.products.length > 0 ? (
              <>
                <div className="flex items-baseline gap-2.5 mb-3">
                  <h2 className="text-[15px] font-extrabold text-[#ededed]">{grupo.label}</h2>
                  <span className="text-[12px] text-[#bebebe]">{grupo.products.length} productos</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grupo.products.map((p) => <ProductCard key={p.id} p={p} />)}
                </div>
              </>
            ) : (
              <p className="text-[13px] text-[#cfcfcf]">
                Este nicho no tiene productos en el rango <span className="text-[#ededed]">{grupo.label}</span>.
                Prueba otro rango.
              </p>
            )}
          </section>
        )}
      </main>
    </ToolShell>
  );
}
