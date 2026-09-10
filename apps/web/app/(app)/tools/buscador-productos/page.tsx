"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, ChevronDown, BadgeCheck, Lock, Clock } from "lucide-react";

// Dónde apareció el término del nicho, en palabras. Es la confianza del
// veredicto: en la URL del producto es casi certeza; solo en el cuerpo del
// anuncio, mucho menos.
const SENAL_TEXTO: Record<string, string> = {
  path: "la dirección del producto",
  titulo: "el titular del anuncio",
  cuerpo: "el texto del anuncio",
  ninguna: "ningún campo directo",
};
import ToolShell from "@/components/tools/ui/ToolShell";
import FlujoDescubrimiento from "@/components/tools/buscador-productos/FlujoDescubrimiento";
import {
  RAW_BUCKETS, RAW_BUCKET_LABEL, CATEGORIES, isRawBucket,
  PAISES, PAIS_LABEL, ANTIGUEDADES, ANTIGUEDAD_LABEL,
  type CategoryId, type RawBucket, type RawProductEntry, type RawSearchResponse,
  type Pais, type Antiguedad,
} from "@ph/shared";

const ACCENT = "#e8467a";

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
          : { borderColor: "rgba(255,255,255,0.12)", color: "#c9b4ae" }
      }
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </button>
  );
}

// Rango que el plan del usuario no desbloquea. Se muestra igual que los otros
// —el usuario tiene que ver qué le falta— pero lleva al paywall en vez de
// buscar. Es un `<a>` y no un Chip con onClick: el destino es una página, y así
// se puede abrir en otra pestaña.
function ChipBloqueado({ label }: { label: string }) {
  return (
    <a
      href="/suscripcion"
      title="Este rango no está incluido en tu plan"
      className="flex items-center gap-1.5 rounded-full border border-white/[0.10] px-3 py-1.5 text-[12px] font-bold text-[#8d7470] no-underline transition-colors hover:border-white/[0.2] hover:text-[#c9b4ae]"
    >
      <Lock className="h-3 w-3" />
      {label}
    </a>
  );
}

// Selector de un filtro global (país, antigüedad). `<select>` nativo y no una
// fila de chips: son 8 y 4 opciones respectivamente, y sumarlas a los chips de
// categoría y de rango dejaría la pantalla en cuatro filas de píldoras.
function Filtro<T extends string | number>({ label, value, options, disabled, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-[#a98c88]">
      {label}
      <select
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
        className="rounded-lg border border-white/[0.12] bg-[#1e0811] px-2.5 py-1.5 text-[12px] font-bold text-[#c9b4ae] disabled:opacity-40"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </label>
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
          : { borderColor: "rgba(255,255,255,0.12)", color: "#c9b4ae" }
      }
    >
      {label}
    </button>
  );
}

// ⚠️ La mayoría de los productos NO llega verificada, así que la pantalla no
// puede prometerlo. El serving descarta lo que el verificador ya probó que no
// sirve y agrupa por rango de anuncios, pero el grueso del inventario sigue en
// 'pendiente' y se sirve igual. Tampoco hay validación de competencia en Perú:
// el inventario incluye avisos peruanos.
//
// Lo que SÍ se puede afirmar es por producto: los que pasaron scan-nicho.ts
// llevan `verificado` y muestran el sello con su share medido. Esa promesa vive
// en la card, una por una — nunca en el encabezado de la pantalla.

function ProductCard({ p }: { p: RawProductEntry }) {
  // Sin nombre ni titular (los anuncios de catálogo llegan con la plantilla sin
  // resolver y `stripAdVars` los deja en null) el título ES el anunciante: ahí
  // el subtítulo solo lleva el país, para no imprimirlo dos veces.
  const titulo = p.productName || p.title;
  return (
    <div className="h-full bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-extrabold text-[#efe7e0] tracking-[-0.2px] leading-tight">
          {titulo || p.advertiser}
        </h3>
        <p className="text-[12px] text-[#a98c88] mt-0.5">
          {[titulo ? p.advertiser : null, p.country].filter(Boolean).join(" · ")}
        </p>
        {p.verificado && (
          <span
            title={
              (p.porProducto
                ? `Verificado: este producto es el ${Math.round((p.share ?? 0) * 100)}% de los anuncios del anunciante`
                : `Verificado: ${Math.round((p.share ?? 0) * 100)}% de los anuncios de este anunciante son del mismo producto`) +
              (p.senal ? ` · el término del nicho aparece en ${SENAL_TEXTO[p.senal]}` : "")
            }
            className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-[0.5px] rounded-full px-2 py-0.5 border border-emerald-400/30 text-emerald-300 bg-emerald-400/10"
          >
            <BadgeCheck className="w-3 h-3" />
            {/* Sirviendo productos, "Monoproducto 15%" se leería como un
                defecto cuando es un producto de una tienda con seis. */}
            {p.porProducto ? "Producto verificado" : `Monoproducto ${Math.round((p.share ?? 0) * 100)}%`}
          </span>
        )}
      </div>

      {p.body && (
        <p className="text-[12px] text-[#c9b4ae] leading-[1.5] line-clamp-3">{p.body}</p>
      )}

      {/* Solo cuando se midió. La columna `ad_start_date` nace NULL y se llena a
          medida que el worker re-scrapea, así que la mayoría de las cards
          todavía no la trae — y una card que dijera "0 días" mentiría. */}
      {p.diasCorriendo !== null && (
        <span className="flex items-center gap-1.5 text-[11px] text-[#a98c88]">
          <Clock className="h-3 w-3" />
          {p.diasCorriendo} días corriendo
        </span>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="readout text-[13px] font-extrabold" style={{ color: ACCENT }}>
          {p.adCount.toLocaleString("es-PE")}
          <span className="text-[10px] text-[#a98c88] uppercase tracking-[1px] font-bold ml-1.5">
            anuncios
          </span>
        </span>
        <a href={p.adsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] font-bold rounded-xl px-3 py-2 no-underline border border-white/[0.12] text-[#efe7e0] transition-colors hover:bg-white/[0.04]">
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
  // La categoría elegida, no la que devuelve la respuesta: así el chip se
  // enciende en el click, antes de que llegue el fetch. null = "Todos" (todo el
  // inventario). Los chips salen de `CATEGORIES`, que es data del código — no
  // hay ninguna llamada para pintarlos.
  const [sel, setSel] = useState<CategoryId | null>(null);
  const [expandido, setExpandido] = useState(false);
  // Página dentro del rango servido. Se resetea en `search`, que es por donde
  // pasan TANTO el cambio de categoría como el de rango — quedarse en la página
  // 4 al cambiar de chip mostraría el final de una lista que recién llega.
  const [pagina, setPagina] = useState(0);
  // Filtros globales: aplican tanto al cambio de categoría como al de rango.
  const [pais, setPais] = useState<Pais | "">("");
  const [dias, setDias] = useState<Antiguedad>(0);
  // Qué VISTA sirve el inventario. Las dos leen las mismas tablas (`ph_*`): la
  // clásica es la lista de siempre y "Descubrimiento" es el flujo de un producto
  // por vez, con cupo y reclamo. No son dos motores — es una interfaz nueva.
  const [vista, setVista] = useState<"lista" | "flujo">("lista");


  // `cat` y `bucket` van por parámetro y no desde el estado: el chip busca en el
  // mismo click en que se marca seleccionado, y el estado todavía no llegó.
  // bucket null = que el servidor elija el primer rango con stock.
  // Los filtros viajan por parámetro (`f`) y no desde el estado por el mismo
  // motivo que `cat`/`bucket`: el `<select>` busca en el mismo cambio en que se
  // actualiza, y el estado todavía no llegó.
  const search = useCallback(async (
    cat: CategoryId | null,
    bucket: RawBucket | null,
    f?: { pais?: Pais | ""; dias?: Antiguedad },
  ) => {
    // cat null = "Todos": el servidor sirve sobre TODOS los nichos con
    // inventario, sin filtrar por categoría.
    const clave = cat ?? "todos";
    if (loading) return;
    setLoading(true);
    setError(null);
    setPagina(0);
    // Cambiar de RANGO no borra lo que hay en pantalla: si se limpiara, el filtro
    // desaparecería a media transición y no habría dónde volver a hacer click.
    // Cambiar de CATEGORÍA sí limpia.
    setResult((prev) => (prev?.niche === clave ? prev : null));
    try {
      const res = await fetch("/api/buscador-productos/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: clave,
          bucket,
          country: (f?.pais ?? pais) || undefined,
          minDias: f?.dias ?? dias,
        }),
      });
      const data = (await res.json()) as RawSearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error en la búsqueda");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [loading, pais, dias]);

  const elegirCategoria = useCallback((id: CategoryId) => {
    setSel(id);
    search(id, null);
  }, [search]);

  // "Todos": el inventario entero, sin filtro de categoría. Es lo que se ve al
  // abrir la herramienta.
  const verTodos = useCallback(() => {
    setSel(null);
    search(null, null);
  }, [search]);

  // Cambiar de vista cambia la HERRAMIENTA, no un filtro: al volver a la lista
  // se re-busca, porque pudo quedar vieja mientras se usaba el flujo.
  const elegirVista = useCallback((v: "lista" | "flujo") => {
    setVista(v);
    if (v === "lista") { setSel(null); search(null, null); }
  }, [search]);

  // Carga inicial. `search` cambia de identidad con `loading`, así que la
  // dependencia sería un bucle: esto corre una sola vez, al montar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search(null, null); }, []);

  // El rango activo lo dicta la respuesta, no el click: sin filtro explícito el
  // servidor autoelige, y el chip encendido tiene que ser el que de verdad salió.
  const grupo = result?.status === "ready" ? result.groups[0] : undefined;
  const paginas = Math.ceil((grupo?.products.length ?? 0) / POR_PAGINA);
  // Rangos que el plan del usuario no desbloquea. Los decide el SERVIDOR (viene
  // en la respuesta): acá solo se pintan. El candado no es el gate — el servidor
  // ya no mandó ni un producto de esos rangos.
  const bloqueados: string[] = result?.locked ?? [];
  // `RawBucketGroup.bucket` es `string` (el tipo deja lugar a rangos futuros);
  // acá se estrecha para poder re-buscar el mismo rango al cambiar un filtro.
  const bucketActual = isRawBucket(grupo?.bucket) ? grupo.bucket : null;

  return (
    <ToolShell name="Buscador de Productos" slug="buscador-productos">
      <main className="flex-1 max-w-[1000px] w-full mx-auto px-8 py-10">
        <div className="mb-6">
          <h1 className="lp-serif text-[26px] leading-[1.15] text-[#f6f2eb] mb-1.5">
            Buscador de Productos
          </h1>
          <p className="text-[14px] text-[#c9b4ae] leading-[1.6]">
            {vista === "flujo"
              ? "Te entregamos un producto por vez. El que abres se suma a tu lista y deja de estar disponible para los demás."
              : "Elige una categoría y encuentra los productos que más están pautando."}
          </p>
        </div>

        {/* ⚠️ ESTO CAMBIA LA HERRAMIENTA, NO EL FILTRO. La lista trae sus chips
            de categoría, rango y filtros; el flujo trae su propia navegación y
            su cupo. Por eso no comparten controles: dejar a la vista el filtro
            de rango junto al flujo mostraría un control que el flujo no usa. */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[12px] text-[#a98c88] mr-1">Vista</span>
          <Chip label="Lista" active={vista === "lista"} busy={loading && vista === "lista"} disabled={loading} onClick={() => elegirVista("lista")} />
          <Chip label="Descubrimiento (beta)" active={vista === "flujo"} disabled={loading} onClick={() => elegirVista("flujo")} />
        </div>

        {vista === "flujo" ? <FlujoDescubrimiento /> : (<>

        {/* Los chips SON la navegación: sin barra de búsqueda, esta lista es la
            única entrada a la herramienta. Son CATEGORÍAS (`@ph/shared`
            `categories.ts`), no nichos: el inventario tiene 528 nichos y esa
            lista no cabe en chips. Van fijas y en código — pintarlas no cuesta
            ninguna llamada. */}
        <div className="flex items-start gap-3 mb-8">
            <span className="text-[12px] text-[#a98c88] shrink-0 py-1.5">Categorías</span>
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
              <Chip label="Todos" active={sel === null} busy={loading && sel === null} disabled={loading} onClick={verTodos} />
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

        {/* Filtros globales. Van fuera del bloque del rango porque aplican también
            cuando la búsqueda no devolvió nada — que es justo cuando el usuario
            necesita poder aflojarlos. */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Filtro
            label="País"
            value={pais}
            disabled={loading}
            options={[
              { value: "" as Pais | "", label: "Todos" },
              ...PAISES.map((c) => ({ value: c as Pais | "", label: PAIS_LABEL[c] })),
            ]}
            onChange={(v) => { setPais(v); search(sel, bucketActual, { pais: v }); }}
          />
          <Filtro
            label="Antigüedad"
            value={dias}
            disabled={loading}
            options={ANTIGUEDADES.map((d) => ({ value: d, label: ANTIGUEDAD_LABEL[d] }))}
            onChange={(v) => { setDias(v); search(sel, bucketActual, { dias: v }); }}
          />
          {dias > 0 && (
            /* Sin esta línea el filtro promete algo que no cumple: `ad_start_date`
               nace NULL y las filas sin medir pasan igual (ver la migración
               20260820000001 y `applyFilters` en db.ts). */
            <span className="text-[11px] text-[#8d7470]">
              Incluye productos cuya antigüedad todavía no medimos.
            </span>
          )}
        </div>

        {error && <p className="text-[13px] text-[#fca5a5] mb-4">{error}</p>}

        {/* Cambiar de categoría vacía el cuerpo: sin esta línea la pantalla
            queda en blanco hasta que responde la API. */}
        {loading && !result && <p className="text-[13px] text-[#a98c88] mb-4">Buscando…</p>}

        {/* No hay estado `pending` por categoría: las categorías son fijas y sus
            nichos ya tienen inventario. El cold start ("lo encolamos") vivía en
            la búsqueda libre por nicho, que ya no existe en la UI. */}
        {result?.status === "empty" && (
          <p className="text-[13px] text-[#c9b4ae]">
            No encontramos productos físicos que cumplan los criterios en esta categoría.
          </p>
        )}

        {/* Un rango a la vez. El filtro se muestra siempre que la búsqueda haya
            salido bien — también con el rango vacío, sino no habría cómo cambiarlo. */}
        {grupo && (
          <section className="mb-10">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[12px] text-[#a98c88] mr-1">Rango de anuncios</span>
              {RAW_BUCKETS.map((b) =>
                bloqueados.includes(b) ? (
                  <ChipBloqueado key={b} label={RAW_BUCKET_LABEL[b]} />
                ) : (
                  <Chip
                    key={b}
                    label={RAW_BUCKET_LABEL[b]}
                    active={grupo.bucket === b}
                    disabled={loading}
                    onClick={() => search(sel, b)}
                  />
                ),
              )}
            </div>

            {grupo.products.length > 0 ? (
              <>
                <div className="flex items-baseline gap-2.5 mb-3">
                  <h2 className="text-[15px] font-extrabold text-[#efe7e0]">{grupo.label}</h2>
                  <span className="text-[12px] text-[#a98c88]">
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
              <p className="text-[13px] text-[#c9b4ae]">
                No hay productos en el rango <span className="text-[#efe7e0]">{grupo.label}</span>
                {pais && ` en ${PAIS_LABEL[pais]}`}
                {dias > 0 && ` con ${ANTIGUEDAD_LABEL[dias].toLowerCase()}`}.
                Prueba otro rango o afloja los filtros.
              </p>
            )}
          </section>
        )}
        </>)}
      </main>
    </ToolShell>
  );
}
