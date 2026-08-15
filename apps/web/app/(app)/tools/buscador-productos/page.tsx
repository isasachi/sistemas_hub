"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, PackageSearch, Flame, ChevronDown } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import {
  RAW_BUCKETS, RAW_BUCKET_LABEL, CATEGORIES,
  type CategoryId, type RawBucket, type RawProductEntry, type RawSearchResponse,
} from "@ph/shared";

const ACCENT = "#ff9b4a";

// La respuesta trae 50 productos por rango y se muestran de a 10.
const POR_PAGINA = 10;

// Chip: mismo botón para las sugerencias de nicho y para el filtro de rango.
// `busy` pinta el spinner del chip que se acaba de clickear; `disabled` apaga
// al resto mientras carga — sin barra de búsqueda, un click ignorado en
// silencio sería la única señal de que la app hace algo.
function Chip({ label, active, busy, disabled, onClick }: {
  label: string; active?: boolean; busy?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      // El chip elegido nunca se atenúa: es el que tiene que leerse encendido
      // justo mientras carga.
      disabled={disabled && !active}
      aria-pressed={active}
      className="flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5 border transition-colors disabled:opacity-40"
      style={
        active
          ? { borderColor: ACCENT, color: ACCENT, background: `${ACCENT}1a` }
          : { borderColor: "rgba(255,255,255,0.12)", color: "#cfcfcf" }
      }
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </button>
  );
}

// Botón de la paginación. Aparte del Chip: es cuadrado, más chico y el activo
// se pinta relleno, no con borde.
function PageBtn({ label, active, disabled, title, onClick }: {
  label: string; active?: boolean; disabled?: boolean; title?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-current={active ? "page" : undefined}
      className="min-w-[30px] h-[30px] px-2 text-[12px] font-bold rounded-lg border transition-colors disabled:opacity-30"
      style={
        active
          ? { borderColor: ACCENT, color: "#0b0b12", background: ACCENT }
          : { borderColor: "rgba(255,255,255,0.12)", color: "#cfcfcf" }
      }
    >
      {label}
    </button>
  );
}

// ⚠️ Los productos NO llegan verificados por las tres reglas. El serving
// (`getApprovedByCategory`, @ph/shared) filtra producto físico y agrupa por
// rango de anuncios, pero la regla de anunciante monoproducto solo PRIORIZA:
// detrás de los verificados va relleno sin verificar. Tampoco hay validación de
// competencia en Perú — el inventario incluye avisos peruanos. No prometas
// ninguna de esas dos cosas en el texto de esta pantalla.

function ProductCard({ p }: { p: RawProductEntry }) {
  // Sin nombre ni titular (los anuncios de catálogo llegan con la plantilla sin
  // resolver y `stripAdVars` los deja en null) el título ES el anunciante: ahí
  // el subtítulo solo lleva el país, para no imprimirlo dos veces.
  const titulo = p.productName || p.title;
  return (
    <div className="h-full bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-extrabold text-[#ededed] tracking-[-0.2px] leading-tight">
          {titulo || p.advertiser}
        </h3>
        <p className="text-[12px] text-[#bebebe] mt-0.5">
          {[titulo ? p.advertiser : null, p.country].filter(Boolean).join(" · ")}
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
  const [result, setResult] = useState<RawSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topPicks, setTopPicks] = useState<RawProductEntry[]>([]);
  // La categoría elegida, no la que devuelve la respuesta: así el chip se
  // enciende en el click, antes de que llegue el fetch. null = "Todos" (la
  // portada). Los chips salen de `CATEGORIES`, que es data del código — no hay
  // ninguna llamada para pintarlos.
  const [sel, setSel] = useState<CategoryId | null>(null);
  const [expandido, setExpandido] = useState(false);
  // Página dentro del rango servido. Se resetea en `search`, que es por donde
  // pasan TANTO el cambio de categoría como el de rango — quedarse en la página
  // 4 al cambiar de chip mostraría el final de una lista que recién llega.
  const [pagina, setPagina] = useState(0);

  // Lo más pautado del rango más alto, de todos los nichos. Se refresca solo:
  // la ruta lee en vivo lo que el daemon de vigencia acaba de escribir.
  useEffect(() => {
    fetch("/api/buscador-productos/top-picks")
      .then((r) => r.json())
      .then((d: { products?: RawProductEntry[] }) => setTopPicks(d.products ?? []))
      .catch(() => {});
  }, []);

  // `cat` y `bucket` van por parámetro y no desde el estado: el chip busca en el
  // mismo click en que se marca seleccionado, y el estado todavía no llegó.
  // bucket null = que el servidor elija el primer rango con stock.
  const search = useCallback(async (cat: CategoryId, bucket: RawBucket | null) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setPagina(0);
    // Cambiar de RANGO no borra lo que hay en pantalla: si se limpiara, el filtro
    // desaparecería a media transición y no habría dónde volver a hacer click.
    // Cambiar de CATEGORÍA sí limpia.
    setResult((prev) => (prev?.niche === cat ? prev : null));
    try {
      const res = await fetch("/api/buscador-productos/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat, bucket }),
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

  const elegirCategoria = useCallback((id: CategoryId) => {
    setSel(id);
    search(id, null);
  }, [search]);

  // "Todos": vuelve a la portada (top picks de todos los nichos). No pega a la
  // API — el marquee ya está cargado desde el mount.
  const verTodos = useCallback(() => {
    setSel(null);
    setResult(null);
    setError(null);
  }, []);

  // El rango activo lo dicta la respuesta, no el click: sin filtro explícito el
  // servidor autoelige, y el chip encendido tiene que ser el que de verdad salió.
  const grupo = result?.status === "ready" ? result.groups[0] : undefined;
  const paginas = Math.ceil((grupo?.products.length ?? 0) / POR_PAGINA);

  return (
    <ToolShell name="Buscador de Productos" slug="buscador-productos">
      <main className="flex-1 max-w-[1000px] w-full mx-auto px-8 py-10">
        <div className="mb-6">
          <h1 className="text-[26px] font-extrabold text-[#ededed] tracking-[-0.5px] mb-1.5">
            Buscador de Productos
          </h1>
          <p className="text-[14px] text-[#cfcfcf] leading-[1.6]">
            Elige una categoría y te mostramos productos físicos que se están pautando.
            Se ve un rango de anuncios a la vez — el filtro lo cambia.
          </p>
        </div>

        {/* Los chips SON la navegación: sin barra de búsqueda, esta lista es la
            única entrada a la herramienta. Son CATEGORÍAS (`@ph/shared`
            `categories.ts`), no nichos: el inventario tiene 528 nichos y esa
            lista no cabe en chips. Van fijas y en código — pintarlas no cuesta
            ninguna llamada. */}
        <div className="flex items-start gap-3 mb-8">
            <span className="text-[12px] text-[#bebebe] shrink-0 py-1.5">Categorías</span>
            {/* ponytail: colapsado = dos filas por altura fija. El chip mide
                33.2px renderizado (12px de texto + line-height del navegador +
                py-1.5 + borde) y el gap es 8 → dos filas = 74.4, la tercera
                arranca en 82.6. 75 corta limpio. Es una heurística de píxeles,
                no de conteo: si cambia el tamaño del chip o la tipografía, se
                remide y se ajusta este número, nada más. */}
            <div
              className="flex-1 flex flex-wrap gap-2 overflow-hidden"
              style={expandido ? undefined : { maxHeight: 75 }}
            >
              <Chip label="Todos" active={sel === null} disabled={loading} onClick={verTodos} />
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.id}
                  label={c.label}
                  active={sel === c.id}
                  busy={loading && sel === c.id}
                  disabled={loading}
                  onClick={() => elegirCategoria(c.id)}
                />
              ))}
            </div>
            {/* ponytail: el toggle aparece por conteo de chips, no midiendo el
                DOM. Con etiquetas muy largas puede sobrar/faltar por uno; si
                molesta, un ResizeObserver sobre el contenedor lo resuelve. */}
            {CATEGORIES.length > 8 && (
              <button
                onClick={() => setExpandido((v) => !v)}
                aria-expanded={expandido}
                className="shrink-0 flex items-center gap-1 text-[12px] font-bold py-1.5"
                style={{ color: ACCENT }}
              >
                {expandido ? "Contraer" : "Expandir"}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandido ? "rotate-180" : ""}`} />
              </button>
            )}
        </div>

        {error && <p className="text-[13px] text-[#fca5a5] mb-4">{error}</p>}

        {/* Cambiar de categoría vacía el cuerpo (y esconde el marquee): sin esta
            línea la pantalla queda en blanco hasta que responde la API. */}
        {loading && !result && <p className="text-[13px] text-[#bebebe] mb-4">Buscando…</p>}

        {/* Portada: mientras no haya búsqueda, lo más pautado de todo el inventario.
            Con resultados en pantalla desaparece — no compite con lo que se buscó. */}
        {!result && !loading && topPicks.length > 0 && (
          <section className="mb-10">
            <div className="flex items-baseline gap-2.5 mb-1">
              <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[#ededed]">
                <Flame className="w-4 h-4" style={{ color: ACCENT }} /> Lo más pautado
              </h2>
              <span className="text-[12px] text-[#bebebe]">{topPicks.length} productos</span>
            </div>
            <p className="text-[12px] text-[#bebebe] mb-3">
              Los de más anuncios activos del rango más alto (100+), de todos los nichos.
              <span className="text-[#6b6b6b]"> · pasa el cursor por encima para detener la cinta</span>
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

        {/* No hay estado `pending` por categoría: las categorías son fijas y sus
            nichos ya tienen inventario. El cold start ("lo encolamos") vivía en
            la búsqueda libre por nicho, que ya no existe en la UI. */}
        {result?.status === "empty" && (
          <p className="text-[13px] text-[#cfcfcf]">
            No encontramos productos físicos que cumplan los criterios en esta categoría.
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
                  disabled={loading}
                  onClick={() => search(sel!, b)}
                />
              ))}
            </div>

            {grupo.products.length > 0 ? (
              <>
                <div className="flex items-baseline gap-2.5 mb-3">
                  <h2 className="text-[15px] font-extrabold text-[#ededed]">{grupo.label}</h2>
                  <span className="text-[12px] text-[#bebebe]">
                    {grupo.products.length} productos
                    {paginas > 1 && ` · página ${pagina + 1} de ${paginas}`}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grupo.products
                    .slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
                    .map((p) => <ProductCard key={p.id} p={p} />)}
                </div>

                {/* La respuesta ya trae las 50: pasar de página no vuelve a pegarle
                    a la API. Números en vez de "cargar más" — así se puede volver. */}
                {paginas > 1 && (
                  <nav className="flex items-center justify-center gap-1.5 mt-6" aria-label="Paginación">
                    <PageBtn
                      label="‹"
                      title="Anterior"
                      disabled={pagina === 0}
                      onClick={() => setPagina((p) => p - 1)}
                    />
                    {Array.from({ length: paginas }, (_, i) => (
                      <PageBtn
                        key={i}
                        label={String(i + 1)}
                        active={i === pagina}
                        onClick={() => setPagina(i)}
                      />
                    ))}
                    <PageBtn
                      label="›"
                      title="Siguiente"
                      disabled={pagina === paginas - 1}
                      onClick={() => setPagina((p) => p + 1)}
                    />
                  </nav>
                )}
              </>
            ) : (
              <p className="text-[13px] text-[#cfcfcf]">
                Esta categoría no tiene productos en el rango <span className="text-[#ededed]">{grupo.label}</span>.
                Prueba otro rango.
              </p>
            )}
          </section>
        )}
      </main>
    </ToolShell>
  );
}
