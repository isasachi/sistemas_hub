"use client";

// PREVIEW del flujo nuevo — NO es la herramienta que se lanza.
//
// Vive en su propia ruta (`/tools/buscador-productos/preview`) y no hay ningún
// enlace hacia acá desde la tool: lo que se lanza es la lista de siempre, y esto
// existe solo para ver cómo queda el flujo.
//
// ⚠️ NO CONSUME NADA Y NO ESCRIBE NADA. El cupo, los comodines y la lista viven
// en el estado de React y se pierden al recargar. No hay tabla de "producto
// tomado", no hay ocultamiento para los demás usuarios y no se descuenta ningún
// crédito — todo eso es la implementación real, que es justamente lo que todavía
// no se decidió construir.
//
// ⚠️ Lee la MISMA ruta que la tool (`/api/buscador-productos/search`), así que
// el plan del usuario sigue decidiendo qué inventario sale. `?motor=discovery`
// lo sirve desde el motor nuevo (`disc_*`); sin el parámetro va por el clásico,
// que es el que hoy tiene inventario en las 13 categorías.

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, Clock, Megaphone, MapPin, Ticket, ArrowRight } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import {
  CATEGORIES, type CategoryId, type RawProductEntry, type RawSearchResponse,
} from "@ph/shared";
import {
  cupoDe, ofreceComodin, siguienteProducto, encuestaCompleta, ENCUESTA_VACIA,
  type Encuesta,
} from "@/lib/product-hunter/preview-flujo";

const ACCENT = "#e8467a";

// ⚠️ CUÁNTOS SE TRAEN POR NICHO. El pool es de dónde sale el producto aleatorio;
// no es lo que el usuario ve (ve uno por vez). 5 es lo pedido para el preview.
const POR_NICHO = 5;

const BUSCANDO = [
  "Recorriendo la biblioteca de anuncios…",
  "Midiendo cuánto lleva corriendo…",
  "Contando el catálogo del anunciante…",
  "Eligiendo uno para vos…",
];

type Paso =
  | "nicho" | "buscando" | "producto" | "confirmar"
  | "volviste" | "encuesta" | "resultado" | "sin-cupo";

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
 * ⚠️ OCULTAR EL NOMBRE OBLIGA A OCULTAR TAMBIÉN EL COPY, y eso no es un detalle
 * de estilo. El cuerpo del anuncio dice el producto con todas las letras
 * ("🟥 RODILLERA ORTOPÉDICA PREMIUM…"), y el titular y el anunciante también.
 * Dejar cualquiera de los cuatro visible permite buscar el producto por fuera y
 * llevárselo sin gastar cupo, que es exactamente lo que este paso existe para
 * evitar.
 *
 * Lo que queda es solo señal estructural: cuántos anuncios, hace cuánto, qué
 * parte del catálogo es el mismo producto y dónde. Y de ahí sale, directamente,
 * por qué hacen falta los comodines: con esto NO se puede saber si el producto
 * sirve hasta abrirlo.
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

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function PreviewFlujoPage() {
  const params = useSearchParams();
  // ponytail: el motor se elige por querystring en vez de por un control en
  // pantalla. Es un preview; quien lo mira sabe qué URL abrió.
  const motor = params.get("motor") === "discovery" ? "discovery" : "raw";

  const [paso, setPaso] = useState<Paso>("nicho");
  const [nicho, setNicho] = useState<string | null>(null);
  const [pool, setPool] = useState<RawProductEntry[]>([]);
  const [vistos, setVistos] = useState<string[]>([]);
  const [actual, setActual] = useState<RawProductEntry | null>(null);
  const [mensaje, setMensaje] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [tier, setTier] = useState(1);
  const [tomados, setTomados] = useState<RawProductEntry[]>([]);
  const [comodinesUsados, setComodinesUsados] = useState(0);
  const [encuesta, setEncuesta] = useState<Encuesta>(ENCUESTA_VACIA);

  // Semillas del motor nuevo (sus "nichos"). En el clásico son las categorías,
  // que son data del código y no hace falta pedirlas.
  const [semillas, setSemillas] = useState<string[]>([]);

  const cupo = cupoDe(tier);
  const quedan = cupo.productos - tomados.length;
  const comodinesQuedan = cupo.comodines - comodinesUsados;

  const traer = useCallback(async (clave: string) => {
    const res = await fetch("/api/buscador-productos/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        motor === "discovery"
          ? { motor: "discovery", seed: clave === "todos" ? undefined : clave }
          : { category: clave },
      ),
    });
    const data = (await res.json()) as RawSearchResponse & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "No pudimos buscar");
    setTier(data.tier ?? 1);
    if (data.seeds) setSemillas(data.seeds);
    return data.groups[0]?.products ?? [];
  }, [motor]);

  // Las semillas del motor nuevo se piden una vez, para poder pintar los chips.
  useEffect(() => {
    if (motor !== "discovery") return;
    traer("todos").catch(() => {});
  }, [motor, traer]);

  // Un producto del pool que no se haya mostrado todavía. Aleatorio a propósito:
  // dos usuarios del mismo nicho no deberían recibir el mismo primero.
  const entregar = useCallback((desde: RawProductEntry[], yaVistos: string[]) => {
    const elegido = siguienteProducto(desde, yaVistos);
    if (!elegido) { setActual(null); setPaso("resultado"); return; }
    setActual(elegido);
    setVistos((v) => [...v, elegido.id]);
    setPaso("producto");
  }, []);

  const elegirNicho = useCallback(async (clave: string) => {
    setNicho(clave);
    setError(null);
    setPaso("buscando");
    setMensaje(0);
    try {
      const productos = await traer(clave);
      const recorte = productos.slice(0, POR_NICHO);
      setPool(recorte);
      setVistos([]);
      // La animación existe para que el paso se lea como "te estamos buscando
      // uno", no para simular trabajo: la respuesta ya llegó.
      setTimeout(() => {
        if (!recorte.length) { setActual(null); setPaso("resultado"); return; }
        entregar(recorte, []);
      }, 1900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setPaso("nicho");
    }
  }, [traer, entregar]);

  // Rota el texto de la animación.
  useEffect(() => {
    if (paso !== "buscando") return;
    const t = setInterval(() => setMensaje((m) => (m + 1) % BUSCANDO.length), 550);
    return () => clearInterval(t);
  }, [paso]);

  const abrir = useCallback(() => {
    if (!actual) return;
    window.open(actual.adsUrl, "_blank", "noopener,noreferrer");
    setPaso("volviste");
  }, [actual]);

  const aceptar = useCallback(() => {
    if (actual) setTomados((t) => [...t, actual]);
    setEncuesta(ENCUESTA_VACIA);
    setPaso(quedan - 1 <= 0 ? "sin-cupo" : "resultado");
  }, [actual, quedan]);

  const usarComodin = useCallback(() => {
    setComodinesUsados((c) => c + 1);
    setEncuesta(ENCUESTA_VACIA);
    setPaso("buscando");
    setMensaje(0);
    setTimeout(() => entregar(pool, vistos), 1500);
  }, [pool, vistos, entregar]);

  const otroDelMismoNicho = useCallback(() => {
    setPaso("buscando");
    setMensaje(0);
    setTimeout(() => entregar(pool, vistos), 1500);
  }, [pool, vistos, entregar]);

  const chips = motor === "discovery"
    ? semillas.map((s) => ({ id: s, label: s }))
    : CATEGORIES.map((c) => ({ id: c.id as CategoryId as string, label: c.label }));

  const puedeCambiar = ofreceComodin(encuesta, comodinesQuedan);
  const algoFalló = encuesta.anuncios === false || encuesta.unSoloProducto === false;

  return (
    <ToolShell name="Buscador de Productos" slug="buscador-productos">
      <main className="flex-1 max-w-[720px] w-full mx-auto px-8 py-10">
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="text-[10px] uppercase tracking-[1.5px] font-bold rounded-full px-2.5 py-1 border border-white/[0.14] text-[#a98c88]">
            Preview · no consume nada
          </span>
          <span className="text-[12px] text-[#a98c88]">
            Motor {motor === "discovery" ? "nuevo" : "clásico"} · Plan {tier}
          </span>
        </div>

        {/* El cupo se muestra SIEMPRE, no solo al gastarlo: es la regla que
            cambia el comportamiento del usuario, así que tiene que estar a la
            vista antes de que haga el primer click. */}
        <div className="flex items-center gap-4 mb-8 text-[12px] text-[#c9b4ae]">
          <span><b className="text-[#efe7e0]">{quedan}</b> de {cupo.productos} productos</span>
          <span className="text-[#a98c88]">·</span>
          <span><b className="text-[#efe7e0]">{comodinesQuedan}</b> de {cupo.comodines} cambios</span>
        </div>

        {error && <p className="text-[13px] text-[#fca5a5] mb-4">{error}</p>}

        {paso === "nicho" && (
          <section>
            <h1 className="lp-serif text-[26px] leading-[1.15] text-[#f6f2eb] mb-1.5">
              ¿Sobre qué quieres buscar?
            </h1>
            <p className="text-[14px] text-[#c9b4ae] leading-[1.6] mb-6">
              Elige un nicho y te entregamos un producto por vez.
            </p>
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c.id}
                  onClick={() => elegirNicho(c.id)}
                  className="text-[12px] font-bold rounded-full px-3 py-1.5 border transition-colors"
                  style={{ borderColor: "rgba(255,255,255,0.12)", color: "#c9b4ae" }}
                >
                  {c.label}
                </button>
              ))}
              {!chips.length && (
                <p className="text-[13px] text-[#a98c88]">
                  El motor nuevo todavía no tiene nichos con productos rankeados.
                </p>
              )}
            </div>
          </section>
        )}

        {paso === "buscando" && (
          <section className="py-16 flex flex-col items-center gap-4">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: ACCENT }} />
            <p className="text-[14px] text-[#c9b4ae]">{BUSCANDO[mensaje]}</p>
          </section>
        )}

        {paso === "producto" && actual && (
          <section className="flex flex-col gap-5">
            <TarjetaAnonima p={actual} nicho={nicho ?? ""} />
            <div className="flex items-center gap-3">
              <Boton onClick={() => setPaso("confirmar")}>
                Abrir este producto <ArrowRight className="inline w-4 h-4 ml-1" />
              </Boton>
              <Boton variante="secundario" onClick={() => setPaso("nicho")}>Cambiar de nicho</Boton>
            </div>
          </section>
        )}

        {paso === "confirmar" && actual && (
          <section className="flex flex-col gap-5">
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5">
              <h2 className="lp-serif text-[20px] text-[#f6f2eb] mb-2">¿Seguro?</h2>
              <p className="text-[13px] text-[#c9b4ae] leading-[1.6]">
                Al abrirlo se suma a tu lista de productos por testear y deja de
                estar disponible para los demás. Te quedan{" "}
                <b className="text-[#efe7e0]">{quedan}</b> de {cupo.productos}.
              </p>
              <p className="text-[12px] text-[#a98c88] leading-[1.6] mt-3">
                Si al abrirlo resulta que no es lo que esperabas, puedes usar uno
                de tus {comodinesQuedan} cambios.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Boton onClick={abrir}>
                Sí, abrir en Ads Library <ExternalLink className="inline w-4 h-4 ml-1" />
              </Boton>
              <Boton variante="secundario" onClick={() => setPaso("producto")}>Volver</Boton>
            </div>
          </section>
        )}

        {paso === "volviste" && (
          <section className="flex flex-col gap-5">
            <p className="text-[14px] text-[#c9b4ae] leading-[1.6]">
              Lo abrimos en otra pestaña. Cuando lo hayas revisado, vuelve acá.
            </p>
            <div className="flex items-center gap-3">
              <Boton onClick={() => setPaso("encuesta")}>Ya lo revisé</Boton>
              <Boton variante="secundario" onClick={abrir}>Abrir de nuevo</Boton>
            </div>
          </section>
        )}

        {paso === "encuesta" && (
          <section className="flex flex-col gap-6">
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

            {/* El comodín se ofrece SOLO cuando la encuesta dice que algo falló.
                Ofrecerlo siempre lo convierte en un "siguiente" gratis y el cupo
                deja de significar nada. */}
            {puedeCambiar && (
              <div className="rounded-2xl p-4 border" style={{ borderColor: `${ACCENT}55`, background: `${ACCENT}0f` }}>
                <p className="text-[13px] text-[#efe7e0] leading-[1.6] mb-3">
                  No era lo que buscabas. Puedes usar un cambio: no se descuenta
                  de tus productos y te entregamos otro.
                </p>
                <div className="flex items-center gap-3">
                  <Boton onClick={usarComodin}>Usar un cambio ({comodinesQuedan})</Boton>
                  <Boton variante="secundario" onClick={aceptar}>Igual me lo quedo</Boton>
                </div>
              </div>
            )}

            {algoFalló && comodinesQuedan === 0 && (
              <p className="text-[13px] text-[#fca5a5]">
                Ya usaste todos tus cambios, así que este producto se queda en tu lista.
              </p>
            )}

            {encuestaCompleta(encuesta) && !algoFalló && (
              <Boton onClick={aceptar}>Guardar en mi lista</Boton>
            )}

            {algoFalló && comodinesQuedan === 0 && <Boton onClick={aceptar}>Continuar</Boton>}
          </section>
        )}

        {paso === "resultado" && (
          <section className="flex flex-col gap-5">
            <h2 className="lp-serif text-[22px] text-[#f6f2eb]">
              {tomados.length ? "Guardado." : "No quedan productos en este nicho."}
            </h2>
            <p className="text-[13px] text-[#c9b4ae] leading-[1.6]">
              Llevas <b className="text-[#efe7e0]">{tomados.length}</b> de {cupo.productos} productos.
            </p>
            <div className="flex items-center gap-3">
              <Boton onClick={otroDelMismoNicho}
                disabled={pool.filter((p) => !vistos.includes(p.id)).length === 0}>
                Otro de {nicho}
              </Boton>
              <Boton variante="secundario" onClick={() => setPaso("nicho")}>Cambiar de nicho</Boton>
            </div>
            {pool.filter((p) => !vistos.includes(p.id)).length === 0 && (
              <p className="text-[12px] text-[#a98c88]">
                Ya viste los {POR_NICHO} de este nicho en esta sesión.
              </p>
            )}
          </section>
        )}

        {paso === "sin-cupo" && (
          <section className="flex flex-col gap-4">
            <h2 className="lp-serif text-[22px] text-[#f6f2eb]">Llegaste a tu límite</h2>
            <p className="text-[13px] text-[#c9b4ae] leading-[1.6]">
              Tomaste {cupo.productos} productos. Tu lista queda guardada y el
              cupo se renueva con tu plan.
            </p>
            <a href="/suscripcion"
              className="text-[13px] font-bold no-underline" style={{ color: ACCENT }}>
              Ver planes →
            </a>
          </section>
        )}
      </main>
    </ToolShell>
  );
}
