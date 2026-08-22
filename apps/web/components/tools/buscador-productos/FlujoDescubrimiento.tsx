"use client";

// El flujo de UN PRODUCTO POR VEZ: la interfaz del motor de descubrimiento.
//
// nicho → animación → tarjeta anónima → confirmación → Ads Library → encuesta →
// aceptar o gastar un cambio → seguir o cambiar de nicho.
//
// Lo renderiza `tools/buscador-productos` cuando el chip de motor está en
// "Descubrimiento". El motor clásico sigue mostrando la lista de siempre.
//
// ⚠️ EL CUPO LO DECIDE EL SERVIDOR. Lo que se pinta acá viene de
// `/api/buscador-productos/claim`, y es esa ruta la que impide tomar el producto
// 6 con el plan 1. El contador de pantalla informa, no limita.
//
// ⚠️ TOMAR UN PRODUCTO LO OCULTA PARA TODOS. Es el punto del rediseño: si la
// lista fuera la misma para todos, varios usuarios terminarían testeando lo
// mismo. El reclamo se escribe ANTES de abrir la Ads Library, no después de la
// encuesta — si se escribiera al final, quien cierra la pestaña se lleva el link
// sin gastar cupo, que es el otro agujero que esto tapa.

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Clock, Megaphone, MapPin, Ticket, ArrowRight } from "lucide-react";
import type { RawProductEntry, RawSearchResponse } from "@ph/shared";
import {
  ofreceComodin, siguienteProducto, encuestaCompleta, ENCUESTA_VACIA, type Cupo, type Encuesta,
} from "@/lib/product-hunter/flujo";

const ACCENT = "#e8467a";

/** Cuántos se traen por nicho. El usuario ve uno por vez; esto es de dónde sale. */
const POR_NICHO = 5;

const BUSCANDO = [
  "Recorriendo la biblioteca de anuncios…",
  "Midiendo cuánto lleva corriendo…",
  "Contando el catálogo del anunciante…",
  "Eligiendo uno para ti…",
];

type Paso =
  | "nicho" | "buscando" | "producto" | "confirmar"
  | "volviste" | "encuesta" | "resultado" | "sin-cupo";

interface EstadoCupo {
  cupo: Cupo;
  quedanProductos: number;
  quedanComodines: number;
  lista: RawProductEntry[];
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

function Boton({ children, onClick, variante = "primario", disabled }: {
  children: React.ReactNode; onClick: () => void;
  variante?: "primario" | "secundario"; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-[13px] font-bold rounded-xl px-4 py-2.5 border transition-colors disabled:opacity-40"
      style={variante === "primario"
        ? { background: ACCENT, borderColor: ACCENT, color: "#0b0b12" }
        : { borderColor: "rgba(255,255,255,0.14)", color: "#efe7e0" }}
    >
      {children}
    </button>
  );
}

function Dato({ icono, valor, rotulo }: { icono: React.ReactNode; valor: string; rotulo: string }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1 py-3">
      <span className="text-[#a98c88]">{icono}</span>
      <span className="readout text-[18px] font-extrabold text-[#efe7e0] leading-none">{valor}</span>
      <span className="text-[10px] uppercase tracking-[1px] text-[#a98c88] font-bold">{rotulo}</span>
    </div>
  );
}

/**
 * La tarjeta ANÓNIMA.
 *
 * ⚠️ OCULTAR EL NOMBRE OBLIGA A OCULTAR TAMBIÉN EL COPY. El cuerpo del anuncio
 * dice el producto con todas las letras ("🟥 RODILLERA ORTOPÉDICA PREMIUM…"), y
 * el titular y el anunciante también: con cualquiera de los cuatro visible se
 * busca el producto por fuera y se lo lleva sin gastar cupo, que es justo lo que
 * este paso existe para evitar.
 *
 * Lo que queda es solo señal estructural — y de ahí sale la necesidad del
 * cambio: con esto NO se puede saber si el producto sirve hasta abrirlo.
 */
function TarjetaAnonima({ p, nicho }: { p: RawProductEntry; nicho: string }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
      <p className="text-[11px] uppercase tracking-[1px] text-[#a98c88] font-bold mb-1">
        Producto sin abrir · {nicho}
      </p>
      <h3 className="lp-serif text-[22px] text-[#f6f2eb] leading-tight mb-4">
        Un producto que cumple tus criterios
      </h3>
      <div className="flex items-stretch divide-x divide-white/[0.06] border-y border-white/[0.06] mb-4">
        <Dato icono={<Megaphone className="w-4 h-4" />}
          valor={p.adCount.toLocaleString("es-PE")} rotulo="anuncios" />
        <Dato icono={<Clock className="w-4 h-4" />}
          valor={p.diasCorriendo !== null ? `${p.diasCorriendo}` : "—"} rotulo="días" />
        <Dato icono={<Ticket className="w-4 h-4" />}
          valor={p.share !== null ? `${Math.round(p.share * 100)}%` : "—"} rotulo="mismo producto" />
        <Dato icono={<MapPin className="w-4 h-4" />}
          valor={p.country ?? "—"} rotulo="país" />
      </div>
      <p className="text-[12px] text-[#a98c88] leading-[1.6]">
        No mostramos el nombre, la marca ni el texto del anuncio: cualquiera de
        los tres alcanza para buscarlo por fuera. Se descubre al abrirlo.
      </p>
    </div>
  );
}

function MiLista({ lista }: { lista: RawProductEntry[] }) {
  if (!lista.length) return null;
  return (
    <div className="mt-8 border-t border-white/[0.06] pt-5">
      <p className="text-[11px] uppercase tracking-[1px] text-[#a98c88] font-bold mb-3">
        Tu lista ({lista.length})
      </p>
      <ul className="flex flex-col gap-2">
        {lista.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-[#efe7e0] truncate">{p.productName || p.title || p.advertiser}</span>
            <a href={p.adsUrl} target="_blank" rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-[12px] font-bold no-underline"
              style={{ color: ACCENT }}>
              Abrir <ExternalLink className="w-3 h-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Flujo ────────────────────────────────────────────────────────────────────

export default function FlujoDescubrimiento() {
  const [paso, setPaso] = useState<Paso>("nicho");
  const [nicho, setNicho] = useState<string | null>(null);
  const [pool, setPool] = useState<RawProductEntry[]>([]);
  const [vistos, setVistos] = useState<string[]>([]);
  const [actual, setActual] = useState<RawProductEntry | null>(null);
  const [mensaje, setMensaje] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [semillas, setSemillas] = useState<string[]>([]);
  const [encuesta, setEncuesta] = useState<Encuesta>(ENCUESTA_VACIA);
  const [estado, setEstado] = useState<EstadoCupo | null>(null);

  const refrescarCupo = useCallback(async () => {
    const res = await fetch("/api/buscador-productos/claim");
    if (!res.ok) return null;
    const data = (await res.json()) as EstadoCupo;
    setEstado(data);
    return data;
  }, []);

  const traer = useCallback(async (seed: string | null) => {
    const res = await fetch("/api/buscador-productos/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motor: "discovery", seed: seed ?? undefined }),
    });
    const data = (await res.json()) as RawSearchResponse & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "No pudimos buscar");
    if (data.seeds) setSemillas(data.seeds);
    return data.groups[0]?.products ?? [];
  }, []);

  // Arranque: cupo y semillas. Las semillas salen de una búsqueda sin filtro,
  // que es la misma llamada que después sirve los productos.
  useEffect(() => {
    refrescarCupo();
    traer(null).catch(() => {});
  }, [refrescarCupo, traer]);

  useEffect(() => {
    if (paso !== "buscando") return;
    const t = setInterval(() => setMensaje((m) => (m + 1) % BUSCANDO.length), 550);
    return () => clearInterval(t);
  }, [paso]);

  const entregar = useCallback((desde: RawProductEntry[], yaVistos: string[]) => {
    const elegido = siguienteProducto(desde, yaVistos);
    if (!elegido) { setActual(null); setPaso("resultado"); return; }
    setActual(elegido);
    setVistos((v) => [...v, elegido.id]);
    setPaso("producto");
  }, []);

  const elegirNicho = useCallback(async (seed: string | null) => {
    setNicho(seed ?? "todos");
    setError(null);
    setPaso("buscando");
    setMensaje(0);
    try {
      const productos = await traer(seed);
      const recorte = productos.slice(0, POR_NICHO);
      setPool(recorte);
      setVistos([]);
      // La animación es para que el paso se lea como "te estamos buscando uno";
      // la respuesta ya llegó.
      setTimeout(() => {
        if (!recorte.length) { setActual(null); setPaso("resultado"); return; }
        entregar(recorte, []);
      }, 1900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setPaso("nicho");
    }
  }, [traer, entregar]);

  /**
   * Reclama y abre.
   *
   * ⚠️ SE ABRE LA PESTAÑA SOLO SI EL RECLAMO SE ESCRIBIÓ. Abrir primero y
   * reclamar después dejaría al usuario con el link de un producto que quizá no
   * pudo tomar (sin cupo, o porque otro se le adelantó).
   */
  const abrir = useCallback(async () => {
    if (!actual) return;
    setError(null);
    const res = await fetch("/api/buscador-productos/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "tomar", dedupeKey: actual.id, seed: nicho }),
    });
    const data = (await res.json()) as EstadoCupo & { error?: string; yaTomado?: boolean };
    if (!res.ok) {
      setEstado((prev) => (data.cupo ? { ...data, lista: prev?.lista ?? [] } : prev));
      if (data.yaTomado) {
        // Alguien se adelantó entre que se mostró y se abrió: se entrega otro.
        setError("Ese producto lo acaba de tomar alguien más. Te damos otro.");
        entregar(pool, vistos);
        return;
      }
      setPaso("sin-cupo");
      return;
    }
    setEstado((prev) => ({ ...data, lista: prev?.lista ?? [] }));
    window.open(actual.adsUrl, "_blank", "noopener,noreferrer");
    setPaso("volviste");
  }, [actual, nicho, pool, vistos, entregar]);

  const cerrar = useCallback(async (comodin: boolean) => {
    if (!actual) return;
    const res = await fetch("/api/buscador-productos/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "cerrar", dedupeKey: actual.id, encuesta, comodin }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "No pudimos guardar tu respuesta");
      return;
    }
    const nuevo = await refrescarCupo();
    setEncuesta(ENCUESTA_VACIA);
    if (comodin) {
      setPaso("buscando");
      setMensaje(0);
      setTimeout(() => entregar(pool, vistos), 1500);
      return;
    }
    setPaso(nuevo && nuevo.quedanProductos <= 0 ? "sin-cupo" : "resultado");
  }, [actual, encuesta, pool, vistos, entregar, refrescarCupo]);

  const otroDelMismoNicho = useCallback(() => {
    setPaso("buscando");
    setMensaje(0);
    setTimeout(() => entregar(pool, vistos), 1500);
  }, [pool, vistos, entregar]);

  const quedanComodines = estado?.quedanComodines ?? 0;
  const puedeCambiar = ofreceComodin(encuesta, quedanComodines);
  const algoFalló = encuesta.anuncios === false || encuesta.unSoloProducto === false;
  const libres = pool.filter((p) => !vistos.includes(p.id)).length;

  return (
    <section>
      {/* El cupo se muestra SIEMPRE, no solo al gastarlo: es la regla que cambia
          el comportamiento, así que tiene que estar a la vista antes del primer
          click. */}
      {estado && (
        <div className="flex items-center gap-4 mb-8 text-[12px] text-[#c9b4ae]">
          <span><b className="text-[#efe7e0]">{estado.quedanProductos}</b> de {estado.cupo.productos} productos</span>
          <span className="text-[#a98c88]">·</span>
          <span><b className="text-[#efe7e0]">{estado.quedanComodines}</b> de {estado.cupo.comodines} cambios</span>
        </div>
      )}

      {error && <p className="text-[13px] text-[#fca5a5] mb-4">{error}</p>}

      {paso === "nicho" && (
        <div>
          <h2 className="lp-serif text-[24px] leading-[1.15] text-[#f6f2eb] mb-1.5">
            ¿Sobre qué quieres buscar?
          </h2>
          <p className="text-[14px] text-[#c9b4ae] leading-[1.6] mb-6">
            Elige un nicho y te entregamos un producto por vez.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => elegirNicho(null)}
              className="text-[12px] font-bold rounded-full px-3 py-1.5 border transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.12)", color: "#c9b4ae" }}
            >
              Todos
            </button>
            {semillas.map((s) => (
              <button
                key={s}
                onClick={() => elegirNicho(s)}
                className="text-[12px] font-bold rounded-full px-3 py-1.5 border transition-colors"
                style={{ borderColor: "rgba(255,255,255,0.12)", color: "#c9b4ae" }}
              >
                {s}
              </button>
            ))}
            {!semillas.length && (
              <p className="text-[13px] text-[#a98c88]">
                El motor todavía no tiene nichos con productos listos. Está descubriendo.
              </p>
            )}
          </div>
          <MiLista lista={estado?.lista ?? []} />
        </div>
      )}

      {paso === "buscando" && (
        <div className="py-16 flex flex-col items-center gap-4">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: ACCENT }} />
          <p className="text-[14px] text-[#c9b4ae]">{BUSCANDO[mensaje]}</p>
        </div>
      )}

      {paso === "producto" && actual && (
        <div className="flex flex-col gap-5">
          <TarjetaAnonima p={actual} nicho={nicho ?? ""} />
          <div className="flex items-center gap-3">
            <Boton onClick={() => setPaso("confirmar")}>
              Abrir este producto <ArrowRight className="inline w-4 h-4 ml-1" />
            </Boton>
            <Boton variante="secundario" onClick={() => setPaso("nicho")}>Cambiar de nicho</Boton>
          </div>
        </div>
      )}

      {paso === "confirmar" && actual && estado && (
        <div className="flex flex-col gap-5">
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
            <h2 className="lp-serif text-[20px] text-[#f6f2eb] mb-2">¿Seguro?</h2>
            <p className="text-[13px] text-[#c9b4ae] leading-[1.6]">
              Al abrirlo se suma a tu lista y deja de estar disponible para los
              demás. Te quedan <b className="text-[#efe7e0]">{estado.quedanProductos}</b> de {estado.cupo.productos}.
            </p>
            <p className="text-[12px] text-[#a98c88] leading-[1.6] mt-3">
              Si al abrirlo resulta que no es lo que esperabas, puedes usar uno de
              tus {estado.quedanComodines} cambios.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Boton onClick={abrir}>
              Sí, abrir en Ads Library <ExternalLink className="inline w-4 h-4 ml-1" />
            </Boton>
            <Boton variante="secundario" onClick={() => setPaso("producto")}>Volver</Boton>
          </div>
        </div>
      )}

      {paso === "volviste" && (
        <div className="flex flex-col gap-5">
          <p className="text-[14px] text-[#c9b4ae] leading-[1.6]">
            Lo abrimos en otra pestaña y ya está en tu lista. Cuando lo hayas
            revisado, vuelve acá.
          </p>
          <div className="flex items-center gap-3">
            <Boton onClick={() => setPaso("encuesta")}>Ya lo revisé</Boton>
            {actual && (
              <Boton variante="secundario"
                onClick={() => window.open(actual.adsUrl, "_blank", "noopener,noreferrer")}>
                Abrir de nuevo
              </Boton>
            )}
          </div>
        </div>
      )}

      {paso === "encuesta" && (
        <div className="flex flex-col gap-6">
          <h2 className="lp-serif text-[22px] text-[#f6f2eb]">¿Cómo te fue?</h2>

          {[
            { k: "anuncios" as const, q: "¿Tenía los anuncios que esperabas?" },
            { k: "unSoloProducto" as const, q: "¿El anunciante vendía un solo producto?" },
          ].map(({ k, q }) => (
            <div key={k}>
              <p className="text-[13px] text-[#c9b4ae] mb-2">{q}</p>
              <div className="flex gap-2">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setEncuesta((e) => ({ ...e, [k]: v }))}
                    className="text-[12px] font-bold rounded-full px-3.5 py-1.5 border transition-colors"
                    style={encuesta[k] === v
                      ? { borderColor: ACCENT, color: ACCENT, background: `${ACCENT}1a` }
                      : { borderColor: "rgba(255,255,255,0.12)", color: "#c9b4ae" }}
                  >
                    {v ? "Sí" : "No"}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* El cambio se ofrece SOLO cuando la encuesta dice que algo falló:
              ofrecerlo siempre lo vuelve un "siguiente" gratis y el cupo deja de
              significar nada. */}
          {puedeCambiar && (
            <div className="rounded-2xl p-4 border" style={{ borderColor: `${ACCENT}55`, background: `${ACCENT}0f` }}>
              <p className="text-[13px] text-[#efe7e0] leading-[1.6] mb-3">
                No era lo que buscabas. Puedes usar un cambio: no se descuenta de
                tus productos y te entregamos otro.
              </p>
              <div className="flex items-center gap-3">
                <Boton onClick={() => cerrar(true)}>Usar un cambio ({quedanComodines})</Boton>
                <Boton variante="secundario" onClick={() => cerrar(false)}>Igual me lo quedo</Boton>
              </div>
            </div>
          )}

          {algoFalló && quedanComodines === 0 && (
            <>
              <p className="text-[13px] text-[#fca5a5]">
                Ya usaste todos tus cambios, así que este producto se queda en tu lista.
              </p>
              <Boton onClick={() => cerrar(false)}>Continuar</Boton>
            </>
          )}

          {encuestaCompleta(encuesta) && !algoFalló && (
            <Boton onClick={() => cerrar(false)}>Guardar en mi lista</Boton>
          )}
        </div>
      )}

      {paso === "resultado" && (
        <div className="flex flex-col gap-5">
          <h2 className="lp-serif text-[22px] text-[#f6f2eb]">
            {estado?.lista.length ? "Guardado." : "No quedan productos en este nicho."}
          </h2>
          {estado && (
            <p className="text-[13px] text-[#c9b4ae] leading-[1.6]">
              Llevas <b className="text-[#efe7e0]">{estado.cupo.productos - estado.quedanProductos}</b> de {estado.cupo.productos} productos.
            </p>
          )}
          <div className="flex items-center gap-3">
            <Boton onClick={otroDelMismoNicho} disabled={libres === 0}>
              Otro de {nicho}
            </Boton>
            <Boton variante="secundario" onClick={() => setPaso("nicho")}>Cambiar de nicho</Boton>
          </div>
          {libres === 0 && (
            <p className="text-[12px] text-[#a98c88]">
              Ya viste los {POR_NICHO} de este nicho en esta sesión.
            </p>
          )}
          <MiLista lista={estado?.lista ?? []} />
        </div>
      )}

      {paso === "sin-cupo" && (
        <div className="flex flex-col gap-4">
          <h2 className="lp-serif text-[22px] text-[#f6f2eb]">Llegaste a tu límite</h2>
          <p className="text-[13px] text-[#c9b4ae] leading-[1.6]">
            Tomaste {estado?.cupo.productos} productos. Tu lista queda guardada y
            el cupo se renueva con tu plan.
          </p>
          <a href="/suscripcion" className="text-[13px] font-bold no-underline" style={{ color: ACCENT }}>
            Ver planes →
          </a>
          <MiLista lista={estado?.lista ?? []} />
        </div>
      )}
    </section>
  );
}
