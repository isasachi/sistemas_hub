"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, ExternalLink, TrendingUp, Loader2, PackageSearch, Calendar, Link2, Check, X } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import type { ProductCard, SearchResponse, UrlResearchResult } from "@ph/shared";

const ACCENT = "#ff9c4d";

const PRIORITY_STYLE: Record<string, { label: string; bg: string; border: string; color: string }> = {
  alta:  { label: "Prioridad alta",  bg: "rgba(255,156,77,0.1)",  border: "rgba(255,156,77,0.25)",  color: "#ff9c4d" },
  media: { label: "Prioridad media", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.12)", color: "#cfcfcf" },
  baja:  { label: "Prioridad baja",  bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.07)", color: "#6b6b6b" },
};

const SCENARIO_TEXT: Record<string, string> = {
  A: "Sin competencia en Perú",
  B: "Competencia baja en Perú",
  C: "Varios competidores en Perú",
  D: "Mercado saturado en Perú",
};

function TopPickCard({ p }: { p: ProductCard }) {
  return (
    <div className="min-w-[240px] max-w-[240px] bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-extrabold text-[#f5f5f5] tracking-[-0.2px] leading-tight line-clamp-2">{p.productName}</h3>
        <span className="readout text-[11px] font-extrabold whitespace-nowrap" style={{ color: ACCENT }}>{Math.round(p.score)}</span>
      </div>
      <div className="text-[12px] text-[#bdbdbd] leading-[1.5]">
        <span className="font-bold text-[#f5f5f5]">{p.adCount}</span> anuncios · {SCENARIO_TEXT[p.peScenario]}
      </div>
      <a href={p.adUrl} target="_blank" rel="noopener noreferrer"
        className="jr-cta mt-auto flex items-center justify-center gap-1.5 text-[12px] font-bold rounded-xl py-2 no-underline">
        Ver anuncio <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

function ProductCardView({ p }: { p: ProductCard }) {
  const prio = PRIORITY_STYLE[p.priority] ?? PRIORITY_STYLE.media;
  return (
    <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] leading-tight">{p.productName}</h3>
          <p className="text-[12px] text-[#8a8a8a] mt-0.5">{p.advertiserName}</p>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ background: prio.bg, border: `1px solid ${prio.border}`, color: prio.color }}>
          {prio.label}
        </span>
      </div>

      <p className="text-[13px] text-[#bdbdbd] leading-[1.6]">{p.whatIs}</p>

      {/* Métricas de validación */}
      <div className="flex gap-3">
        <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
          <div className="readout text-[20px] font-extrabold" style={{ color: ACCENT }}>{p.adCount}</div>
          <div className="text-[10px] text-[#8a8a8a] uppercase tracking-[1px] font-bold">anuncios</div>
        </div>
        <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
          <div className="readout text-[20px] font-extrabold" style={{ color: ACCENT }}>{p.daysRunning ?? "?"}</div>
          <div className="text-[10px] text-[#8a8a8a] uppercase tracking-[1px] font-bold">días activo</div>
        </div>
        <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
          <div className="text-[20px] font-extrabold text-[#f5f5f5]">{p.foundCountry}</div>
          <div className="text-[10px] text-[#8a8a8a] uppercase tracking-[1px] font-bold">país</div>
        </div>
      </div>

      {/* Atributos */}
      {p.attributes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.attributes.map((a) => (
            <span key={a} className="text-[11px] text-[#bdbdbd] bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded-lg">{a}</span>
          ))}
        </div>
      )}

      {/* Mercado Perú */}
      <div className="bg-white/[0.03] rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <TrendingUp className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          <span className="text-[12px] font-bold text-[#f5f5f5]">{SCENARIO_TEXT[p.peScenario]}</span>
        </div>
        {p.peCompetitors.length > 0 ? (
          <p className="text-[11px] text-[#bdbdbd] leading-[1.5]">
            {p.peCompetitors.map((c) => `${c.name} (${c.adCount} ads)`).join(" · ")}
          </p>
        ) : (
          <p className="text-[11px] text-[#bdbdbd]">0 competidores directos encontrados en el pool de Perú.</p>
        )}
      </div>

      {/* CTAs */}
      <div className="flex gap-2">
        <a href={p.adUrl} target="_blank" rel="noopener noreferrer"
          className="jr-cta flex-1 flex items-center justify-center gap-1.5 text-[13px] font-bold rounded-xl py-2.5 no-underline">
          Ver anuncio <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <a href={p.pageUrl} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold rounded-xl py-2.5 no-underline border border-white/[0.12] text-[#f5f5f5] transition-colors hover:bg-white/[0.04]">
          Ver todos los anuncios
        </a>
      </div>
    </div>
  );
}

function RuleCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px]" style={{ color: ok ? "#7fd88f" : "#e58d8d" }}>
      {ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </div>
  );
}

function UrlResearchView({ r }: { r: UrlResearchResult }) {
  const v = r.verdict;
  const meetsAds = v.adCount >= 40;
  const meetsDays = (v.daysRunning ?? 0) >= 10;
  // El escenario null = no verificado (probe bloqueado). Solo A/B cuentan como "sin saturar".
  const notSaturated = r.peScenario === "A" || r.peScenario === "B";
  const isWinner = meetsAds && meetsDays && notSaturated;

  return (
    <div className="flex flex-col gap-4">
      {/* Veredicto */}
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-extrabold text-[#f5f5f5] tracking-[-0.3px] leading-tight">{v.productName}</h3>
            <p className="text-[12px] text-[#8a8a8a] mt-0.5">{v.pageName}</p>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
            style={isWinner
              ? { background: "rgba(127,216,143,0.1)", border: "1px solid rgba(127,216,143,0.25)", color: "#7fd88f" }
              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "#cfcfcf" }}>
            {isWinner ? "Producto ganador" : "No cumple todo"}
          </span>
        </div>

        <p className="text-[13px] text-[#bdbdbd] leading-[1.6]">{v.whatItIs}</p>

        {/* Métricas */}
        <div className="flex gap-3">
          <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
            <div className="readout text-[20px] font-extrabold" style={{ color: ACCENT }}>{v.adCount}</div>
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-[1px] font-bold">anuncios</div>
          </div>
          <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
            <div className="readout text-[20px] font-extrabold" style={{ color: ACCENT }}>{v.daysRunning ?? "?"}</div>
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-[1px] font-bold">días activo</div>
          </div>
          <div className="flex-1 bg-white/[0.03] rounded-xl px-3 py-2.5 text-center">
            <div className="readout text-[20px] font-extrabold" style={{ color: ACCENT }}>{Math.round(v.score)}</div>
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-[1px] font-bold">score</div>
          </div>
        </div>

        {/* Reglas de oro */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 bg-white/[0.02] rounded-xl px-3 py-2.5">
          <RuleCheck ok={meetsAds} label="≥40 anuncios activos" />
          <RuleCheck ok={meetsDays} label="≥10 días corriendo" />
          <RuleCheck ok={notSaturated} label={r.peScenario === null ? "Perú sin verificar" : "sin saturar en Perú"} />
        </div>

        {v.attributes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {v.attributes.map((a) => (
              <span key={a} className="text-[11px] text-[#bdbdbd] bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded-lg">{a}</span>
            ))}
          </div>
        )}

        {/* Competencia en Perú */}
        <div className="bg-white/[0.03] rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: ACCENT }} />
            <span className="text-[12px] font-bold text-[#f5f5f5]">
              {r.peScenario === null ? "Competencia en Perú no verificada" : SCENARIO_TEXT[r.peScenario]}
            </span>
          </div>
          {r.peScenario === null ? (
            <p className="text-[11px] text-[#bdbdbd] leading-[1.5]">No pudimos verificar la competencia en Perú ahora mismo (Meta limitó la consulta). Vuelve a intentarlo en unos minutos.</p>
          ) : r.peCompetitors.length > 0 ? (
            <p className="text-[11px] text-[#bdbdbd] leading-[1.5]">
              {r.peCompetitors.map((c) => `${c.name} (${c.adCount} ads)`).join(" · ")}
            </p>
          ) : (
            <p className="text-[11px] text-[#bdbdbd]">0 competidores directos corriendo este producto en Perú.</p>
          )}
        </div>

        {/* CTAs */}
        <div className="flex gap-2">
          <a href={r.adUrl} target="_blank" rel="noopener noreferrer"
            className="jr-cta flex-1 flex items-center justify-center gap-1.5 text-[13px] font-bold rounded-xl py-2.5 no-underline">
            Ver anuncio <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a href={r.pageUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold rounded-xl py-2.5 no-underline border border-white/[0.12] text-[#f5f5f5] transition-colors hover:bg-white/[0.04]">
            Ver todos los anuncios
          </a>
        </div>
      </div>

      {/* Mercado LATAM */}
      {r.marketCompetitors.length > 0 && (
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-[13px] font-bold text-[#f5f5f5]">Quién más lo vende en LATAM</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {r.marketCompetitors.map((c, i) => (
              <div key={`${c.name}-${i}`} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-[#bdbdbd] truncate">{c.name}</span>
                <span className="text-[#8a8a8a] whitespace-nowrap">{c.adCount} ads · {c.country}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuscadorProductos() {
  const [mode, setMode] = useState<"niche" | "url">("niche");
  const [niche, setNiche] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modo "pega un anuncio" (research por URL)
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlResult, setUrlResult] = useState<UrlResearchResult | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlRequestId, setUrlRequestId] = useState<string | null>(null);
  const [urlTimedOut, setUrlTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  // Cuota diaria
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const [todayProducts, setTodayProducts] = useState<ProductCard[]>([]);
  const [showToday, setShowToday] = useState(false);

  // Top picks de la semana (showcase, no gasta cuota ni marca visto)
  const [topPicks, setTopPicks] = useState<ProductCard[]>([]);
  useEffect(() => {
    fetch("/api/buscador-productos/top-picks")
      .then((r) => r.json())
      .then((d) => setTopPicks(d.products ?? []))
      .catch(() => {});
  }, []);

  // Al cargar: restaurar consolidado si el usuario ya agotó las 3 búsquedas hoy
  useEffect(() => {
    fetch("/api/buscador-productos/today")
      .then((r) => r.json())
      .then((d) => {
        if (d.exhausted) {
          setQuotaExhausted(true);
          setTodayProducts(d.products ?? []);
          setShowToday(true);
        }
      })
      .catch(() => {});
  }, []);

  const fetchToday = useCallback(() => {
    fetch("/api/buscador-productos/today")
      .then((r) => r.json())
      .then((d) => {
        setTodayProducts(d.products ?? []);
        setShowToday(true);
      })
      .catch(() => {});
  }, []);

  const search = useCallback(async () => {
    if (loading) return; // evita doble-submit por Enter repetido → quema la cuota de 3/día
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
      if (res.status === 429) {
        const { error: msg, code } = await res.json();
        if (code === "quota") {
          setQuotaExhausted(true);
          fetchToday();
        }
        setError(msg ?? "Límite alcanzado");
        return;
      }
      const data = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error en la búsqueda");
      setResult(data);

      // Marcar como vistos los mostrados (se hunden y reaparecen tras 7 días).
      // Con la composición 1/7/2 todos los mostrados son ganadores reales (en
      // bestEffort solo la slot alta está promovida), así que se consumen igual.
      if (data.status === "ready" && data.products.length) {
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
  }, [niche, fetchToday, loading]);

  // Polling del resultado, resumible: si se agota el cap NO se descarta el id — el
  // usuario puede reanudar (el row puede quedar `ready` justo después). Evita
  // huérfanos: un research completado nunca se vuelve inalcanzable.
  const pollResult = useCallback((id: string) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setUrlLoading(true);
    setUrlTimedOut(false);
    const started = Date.now();
    const poll = async () => {
      try {
        const r = await fetch(`/api/buscador-productos/research/${id}`);
        const d = await r.json();
        if (d.status === "ready" && d.result) {
          setUrlResult(d.result as UrlResearchResult);
          setUrlLoading(false);
          return;
        }
        if (d.status === "error" || d.status === "blocked") {
          setUrlError(d.error ?? "No pudimos completar el research. Intenta de nuevo.");
          setUrlLoading(false);
          return;
        }
        if (Date.now() - started > 240_000) {
          setUrlTimedOut(true);   // conserva urlRequestId → botón para reanudar
          setUrlLoading(false);
          return;
        }
        pollRef.current = setTimeout(poll, 3000);
      } catch {
        pollRef.current = setTimeout(poll, 3000);
      }
    };
    pollRef.current = setTimeout(poll, 3000);
  }, []);

  // Research por URL: encola la request y arranca el polling.
  const researchUrl = useCallback(async () => {
    if (urlLoading) return; // evita doble-submit → quema cuota
    const u = url.trim();
    if (!u) return;
    setUrlLoading(true);
    setUrlError(null);
    setUrlResult(null);
    setUrlRequestId(null);
    setUrlTimedOut(false);
    try {
      const res = await fetch("/api/buscador-productos/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (res.status === 429) {
        if (data.code === "quota") { setQuotaExhausted(true); fetchToday(); }
        setUrlError(data.error ?? "Límite alcanzado");
        setUrlLoading(false);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No pudimos procesar esa URL");

      const id = data.requestId as string;
      setUrlRequestId(id);
      pollResult(id);
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : "Error desconocido");
      setUrlLoading(false);
    }
  }, [url, urlLoading, fetchToday, pollResult]);

  return (
    <ToolShell name="Buscador de Productos" slug="buscador-productos">

      <main className="flex-1 max-w-[760px] w-full mx-auto px-8 py-10">
        <div className="mb-6">
          <h1 className="text-[26px] font-extrabold text-[#f5f5f5] tracking-[-0.5px] mb-1.5">Buscador de Productos Ganadores</h1>
          <p className="text-[14px] text-[#bdbdbd] leading-[1.6]">
            Escribe un nicho (ej: <span className="text-[#f5f5f5]">espalda</span>, <span className="text-[#f5f5f5]">acne</span>, <span className="text-[#f5f5f5]">rodilla</span>) y te mostramos productos validados en LATAM con su situación de competencia en Perú.
          </p>
          {!quotaExhausted && (
            <p className="text-[12px] text-[#8a8a8a] mt-1">3 búsquedas por día · reset a medianoche hora Lima</p>
          )}
        </div>

        {/* Top picks de la semana */}
        {topPicks.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp className="w-4 h-4" style={{ color: ACCENT }} />
              <span className="text-[13px] font-bold text-[#f5f5f5]">Top picks de la semana</span>
            </div>
            {/* Cinta auto-scroll (se pausa al hover para poder leer/clickear una card) */}
            <div className="group relative -mx-1 overflow-hidden px-1 py-1">
              <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#0a0a0a] to-transparent" />
              <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#0a0a0a] to-transparent" />
              <div className="jr-marquee flex w-max gap-3 group-hover:[animation-play-state:paused]">
                {[...topPicks, ...topPicks].map((p, i) => (
                  <div key={`${p.id}-${i}`} className="shrink-0" aria-hidden={i >= topPicks.length}>
                    <TopPickCard p={p} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cuota agotada */}
        {quotaExhausted && (
          <div className="mb-6 bg-[rgba(255,156,77,0.06)] border border-[rgba(255,156,77,0.18)] rounded-xl p-4 flex items-start gap-3">
            <Calendar className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ACCENT }} />
            <div className="flex-1">
              <p className="text-[13px] text-[#ffb877] font-semibold mb-1">Límite diario alcanzado</p>
              <p className="text-[12px] text-[#bdbdbd]">Usaste tus 3 búsquedas de hoy. Vuelve mañana para seguir buscando.</p>
              {todayProducts.length > 0 && (
                <button
                  onClick={() => setShowToday((v) => !v)}
                  className="mt-2 text-[12px] font-semibold text-[#ff9c4d] hover:text-[#ffb877] transition-colors border-0 bg-transparent cursor-pointer p-0">
                  {showToday ? "Ocultar" : "Ver"} los mejores de hoy ({todayProducts.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Consolidado del día */}
        {showToday && todayProducts.length > 0 && (
          <div className="mb-8 flex flex-col gap-4">
            <span className="text-[12px] text-[#8a8a8a]">Mejores productos de hoy · {todayProducts.length} en total</span>
            {todayProducts.map((p) => <ProductCardView key={p.id} p={p} />)}
          </div>
        )}

        {/* Selector de modo */}
        {!quotaExhausted && (
          <div className="flex gap-1 mb-3 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl w-fit">
            {([["niche", "Buscar por nicho"], ["url", "Pega un anuncio"]] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-bold cursor-pointer border-0 transition-colors flex items-center gap-1.5"
                style={mode === m
                  ? { background: "rgba(255,156,77,0.14)", color: ACCENT }
                  : { background: "transparent", color: "#8a8a8a" }}>
                {m === "url" && <Link2 className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Search bar — nicho */}
        {!quotaExhausted && mode === "niche" && (
          <div className="flex gap-2 mb-8">
            <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl px-4">
              <Search className="w-4 h-4 text-[#8a8a8a]" />
              <input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="Escribe un nicho..."
                aria-label="Nicho a buscar"
                className="flex-1 bg-transparent py-3 text-[14px] text-[#f5f5f5] placeholder:text-[#8a8a8a] outline-none"
              />
            </div>
            <button
              onClick={search}
              disabled={loading || !niche.trim()}
              className="jr-cta px-5 rounded-xl text-[14px] font-bold disabled:opacity-40 cursor-pointer border-0 flex items-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Buscar
            </button>
          </div>
        )}

        {/* Research por URL — pega un anuncio */}
        {!quotaExhausted && mode === "url" && (
          <div className="mb-8">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl px-4">
                <Link2 className="w-4 h-4 text-[#8a8a8a]" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && researchUrl()}
                  placeholder="Pega la URL del anuncio o anunciante de Meta Ads Library..."
                  aria-label="URL de Meta Ads Library"
                  className="flex-1 bg-transparent py-3 text-[14px] text-[#f5f5f5] placeholder:text-[#8a8a8a] outline-none"
                />
              </div>
              <button
                onClick={researchUrl}
                disabled={urlLoading || !url.trim()}
                className="jr-cta px-5 rounded-xl text-[14px] font-bold disabled:opacity-40 cursor-pointer border-0 flex items-center gap-2">
                {urlLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Investigar
              </button>
            </div>
            <p className="text-[12px] text-[#8a8a8a] mt-2">
              Abre un anuncio en la Biblioteca de Anuncios de Meta y copia el enlace. Analizamos ese producto y su competencia en Perú.
            </p>

            {urlError && (
              <div role="alert" className="mt-4 bg-[rgba(233,61,61,0.08)] border border-[rgba(233,61,61,0.2)] rounded-xl p-4 text-[13px] text-[#fca5a5]">{urlError}</div>
            )}

            <div aria-live="polite" className="mt-6">
              {urlLoading && !urlResult && (
                <div className="text-center py-16">
                  <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-[#8a8a8a]" />
                  <h3 className="text-[16px] font-bold text-[#f5f5f5] mb-1">Investigando el producto</h3>
                  <p className="text-[13px] text-[#bdbdbd] max-w-[380px] mx-auto leading-[1.6]">
                    Estamos analizando el anuncio y su competencia en Perú. Suele tardar cerca de un minuto.
                  </p>
                </div>
              )}
              {urlTimedOut && !urlResult && urlRequestId && (
                <div className="text-center py-16">
                  <PackageSearch className="w-8 h-8 mx-auto mb-3 text-[#8a8a8a]" />
                  <h3 className="text-[16px] font-bold text-[#f5f5f5] mb-1">Está tardando más de lo normal</h3>
                  <p className="text-[13px] text-[#bdbdbd] max-w-[380px] mx-auto leading-[1.6] mb-4">
                    El research sigue en proceso. No perdiste tu búsqueda — revisa el resultado en un momento.
                  </p>
                  <button
                    onClick={() => pollResult(urlRequestId)}
                    className="jr-cta px-5 py-2.5 rounded-xl text-[13px] font-bold cursor-pointer border-0">
                    Ver resultado
                  </button>
                </div>
              )}
              {urlResult && <UrlResearchView r={urlResult} />}
            </div>
          </div>
        )}

        {/* Error */}
        {mode === "niche" && error && !quotaExhausted && (
          <div role="alert" className="bg-[rgba(233,61,61,0.08)] border border-[rgba(233,61,61,0.2)] rounded-xl p-4 text-[13px] text-[#fca5a5] mb-4">{error}</div>
        )}

        <div aria-live="polite" hidden={mode !== "niche"}>
        {result?.status === "pending" && (
          <div className="text-center py-16">
            <PackageSearch className="w-10 h-10 mx-auto mb-3 text-[#8a8a8a]" />
            {result.queued ? (
              <>
                <h3 className="text-[16px] font-bold text-[#f5f5f5] mb-1">Nicho nuevo en cola</h3>
                <p className="text-[13px] text-[#bdbdbd] max-w-[380px] mx-auto leading-[1.6]">
                  <span className="text-[#f5f5f5]">{result.niche}</span> es nuevo para nosotros. Ya lo pusimos en cola — los primeros resultados suelen estar listos en unas horas. Vuelve más tarde.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-[16px] font-bold text-[#f5f5f5] mb-1">Analizando este nicho</h3>
                <p className="text-[13px] text-[#bdbdbd] max-w-[380px] mx-auto leading-[1.6]">
                  Ya tenemos anuncios de <span className="text-[#f5f5f5]">{result.niche}</span> y los estamos analizando. Los productos validados aparecerán aquí en breve — vuelve más tarde.
                </p>
              </>
            )}
          </div>
        )}

        {result?.status === "empty" && (
          <div className="text-center py-16">
            <PackageSearch className="w-10 h-10 mx-auto mb-3 text-[#8a8a8a]" />
            <h3 className="text-[16px] font-bold text-[#f5f5f5] mb-1">Sin ganadores en este nicho</h3>
            <p className="text-[13px] text-[#bdbdbd] max-w-[380px] mx-auto leading-[1.6]">
              Revisamos <span className="text-[#f5f5f5]">{result.niche}</span> y por ahora no encontramos productos que cumplan las reglas (≥40 anuncios, ≥10 días, sin pauta en Perú). Prueba con otro nicho.
            </p>
          </div>
        )}

        {result?.status === "ready" && (
          <div className="flex flex-col gap-4">
            {result.bestEffort && (
              <div className="bg-[rgba(255,156,77,0.08)] border border-[rgba(255,156,77,0.2)] rounded-xl p-4 text-[13px] text-[#ffb877] leading-[1.6]">
                Ninguno alcanzó prioridad alta en este nicho — el de mayor score se muestra en la slot de alta. El resto son ganadores validados.
              </div>
            )}
            {result.allSeen && !result.bestEffort && (
              <div className="bg-[rgba(255,156,77,0.06)] border border-[rgba(255,156,77,0.18)] rounded-xl p-4 text-[13px] text-[#ffb877] leading-[1.6]">
                Ya viste los ganadores más recientes de este nicho — te re-mostramos los mejores mientras llegan nuevos en las próximas corridas.
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#8a8a8a]">
                {result.products.length} productos
                {result.totalUnseen > 0 && ` · ${result.totalUnseen} nuevos para ti`}
              </span>
            </div>
            {result.products.map((p) => <ProductCardView key={p.id} p={p} />)}
          </div>
        )}
        </div>
      </main>
    </ToolShell>
  );
}
