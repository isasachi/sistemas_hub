import { Check, Lock, Search, Sparkles, Star, Crown, Rocket, type LucideIcon } from "lucide-react";
import { PLANS, TIERS, RAW_BUCKETS, RAW_BUCKET_LABEL, unlocksBucket, type Tier } from "@ph/shared";

/**
 * La tabla de precios. UN solo componente para la home y para `/suscripcion`:
 * antes la home vendía "Explorador S/ 0 · Operador S/ 149 · Agencia S/ 399", que
 * no era ningún plan real — con dos copias de la tabla, una siempre miente.
 *
 * ⚠️ TODOS LOS NÚMEROS SALEN DE `PLANS` (@ph/shared), que es la misma fuente que
 * usa el servidor para servir. Los rangos con candado se derivan de
 * `unlocksBucket`, no de una lista escrita a mano: si mañana el plan 2 desbloquea
 * otro rango, la card lo refleja sola.
 *
 * ── La jerarquía visual sale del BRANDBOOK, no del gusto ────────────────────
 * El sistema tiene dos ejes y aquí caen justos:
 *   · CARMESÍ = acción, y "un solo objeto carmesí pleno por pantalla". Se lo
 *     lleva Scale, que es el plan que queremos que se elija.
 *   · CREMA = prestigio (`.jr-btn-gold` es "el único relleno crema del sistema",
 *     17.14:1 sobre granate). Se lo lleva Empire, que tiene que leerse premium
 *     sin robarle el carmesí a Scale.
 * Start queda en el botón secundario: presente, sin pelear.
 */

interface CopyPlan {
  /** Para quién es — va debajo del nombre. */
  para: string;
  /** La promesa, en una línea. */
  promesa: string;
  etiqueta: { texto: string; Icono: LucideIcon; tono: "neutro" | "accion" | "prestigio" };
  /** Título del bloque de buscador: cambia con lo que el plan desbloquea. */
  buscador: string;
  cta: string;
}

const COPY: Record<Tier, CopyPlan> = {
  1: {
    para: "Para empezar a encontrar y validar productos",
    promesa: "Encuentra tu próximo producto para vender",
    etiqueta: { texto: "Para empezar", Icono: Rocket, tono: "neutro" },
    buscador: "Buscador de productos",
    cta: "Empezar con Start",
  },
  2: {
    para: "Para encontrar más oportunidades y crear más rápido",
    promesa: "Más productos. Más creativos. Más oportunidades.",
    etiqueta: { texto: "Más popular", Icono: Star, tono: "accion" },
    buscador: "Buscador avanzado",
    cta: "Empezar prueba gratis",
  },
  3: {
    para: "Para llevar tu e-commerce al máximo",
    promesa: "Todo el poder de Legacy Brand",
    etiqueta: { texto: "Más completo", Icono: Crown, tono: "prestigio" },
    buscador: "Buscador completo",
    cta: "Empezar prueba gratis",
  },
};

/**
 * Lo que viene en los tres planes. Con su porqué, no solo el nombre: en una
 * tabla de precios la lista pelada no le dice a nadie qué gana.
 */
export const INCLUIDO_EN_TODOS = [
  {
    titulo: "Generador de anuncios estáticos",
    detalle: "Crea creativos para tus productos utilizando IA.",
  },
  {
    titulo: "Generador de branding y landings",
    detalle: "Construye la identidad de tu marca y genera páginas de venta listas para usar.",
  },
  {
    titulo: "Calculadora de costos y rentabilidad",
    detalle: "Descubre si un producto realmente deja margen antes de invertir.",
  },
  {
    titulo: "Generador de Video Ads UGC",
    detalle: "Crea videos publicitarios utilizando tu propia API key de KIE.",
  },
  {
    titulo: "Hub de herramientas de IA para e-commerce",
    detalle: "Todo lo que necesitas para investigar, crear y lanzar productos desde un solo lugar.",
  },
];

const ETIQUETA_TONO = {
  // Crema tenue: presente sin competir. El eyebrow carmesí le robaría la
  // jerarquía al CTA (BRANDBOOK §2, "los dos ejes").
  neutro: "border-white/[0.12] bg-white/[0.04] text-[#c9b4ae]",
  accion: "border-transparent bg-[#bd1347] text-[#f6f2eb]",
  prestigio: "border-transparent bg-[#e8dcd6] text-[#1e0811]",
} as const;

function Item({ texto, incluido }: { texto: string; incluido: boolean }) {
  const Icono = incluido ? Check : Lock;
  return (
    <li className="flex items-start gap-2.5">
      <Icono
        aria-hidden
        className={`mt-[3px] h-4 w-4 shrink-0 ${incluido ? "text-[#e8467a]" : "text-[#8d7470]"}`}
      />
      <span
        className={`font-[Lato] text-[14px] leading-[1.5] ${incluido ? "text-[#c9b4ae]" : "text-[#8d7470]"}`}
      >
        {texto}
      </span>
    </li>
  );
}

function Grupo({ titulo, Icono, children }: {
  titulo: string; Icono: LucideIcon; children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a98c88]">
        <Icono className="h-3.5 w-3.5" aria-hidden />
        {titulo}
      </p>
      <ul className="flex list-none flex-col gap-2 p-0">{children}</ul>
    </div>
  );
}

export interface PlanesGridProps {
  /** A dónde manda el CTA de cada plan (signup en la home, checkout en /suscripcion). */
  hrefDe: (tier: Tier) => string;
  /** El plan que el usuario ya tiene: se marca y pierde su CTA. */
  actual?: Tier | null;
  /** Acceso de por vida: no se le ofrece comprar nada. */
  bloqueado?: boolean;
}

export function PlanesGrid({ hrefDe, actual = null, bloqueado = false }: PlanesGridProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
      {TIERS.map((tier) => {
        const plan = PLANS[tier];
        const copy = COPY[tier];
        const esActual = actual === tier;
        // Scale se eleva y se marca: es el plan que queremos que se elija. Si el
        // usuario ya tiene uno, el destacado es el SUYO — resaltarle otro sobre su
        // propia card es venderle algo mientras le tapamos lo que ya pagó.
        const destacado = actual ? esActual : tier === 2;

        return (
          <div
            key={tier}
            className={`lp-card ${tier === 3 ? "lp-leak" : ""} flex flex-col p-8 ${
              destacado ? "border-[rgba(232,70,122,0.45)] lg:-mt-4 lg:pb-10" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="lp-label !text-[10px] !text-[#c9b4ae]">{plan.nombre}</span>
              <span
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                  esActual ? "border-white/[0.28] bg-white/[0.10] text-[#f6f2eb]" : ETIQUETA_TONO[copy.etiqueta.tono]
                }`}
              >
                {!esActual && <copy.etiqueta.Icono className="h-3 w-3" aria-hidden />}
                {esActual ? "Tu plan" : copy.etiqueta.texto}
              </span>
            </div>

            <p className="mt-2 font-[Lato] text-[13px] leading-[1.5] text-[#a98c88]">
              {copy.para}
            </p>

            <div className="mt-5 flex items-baseline gap-2">
              <span className="readout text-[40px] font-bold leading-none text-[#f6f2eb]">
                ${plan.precio}
              </span>
              <span className="font-[Lato] text-[13px] text-[#8d7470]">/ mes</span>
            </div>

            <p className="mt-3 font-[Lato] text-[14px] leading-[1.5] text-[#efe7e0]">
              {copy.promesa}
            </p>

            <div className="mt-7 mb-8 flex flex-col gap-5">
              <Grupo titulo={copy.buscador} Icono={Search}>
                {/* Derivado de PLANS: el candado no está escrito a mano. */}
                {RAW_BUCKETS.map((b) => {
                  const incluido = unlocksBucket(tier, b);
                  return (
                    <Item
                      key={b}
                      incluido={incluido}
                      texto={incluido ? `Productos con ${RAW_BUCKET_LABEL[b]}` : RAW_BUCKET_LABEL[b]}
                    />
                  );
                })}
                <Item incluido texto={`Hasta ${plan.porRango} productos por rango`} />
              </Grupo>

              <Grupo titulo="Creación con IA" Icono={Sparkles}>
                <Item incluido texto={`${plan.creditos} imágenes al mes`} />
              </Grupo>

              <Grupo titulo="Incluido también" Icono={Check}>
                {INCLUIDO_EN_TODOS.map((i) => (
                  <Item key={i.titulo} incluido texto={i.titulo} />
                ))}
              </Grupo>
            </div>

            {esActual ? (
              <p className="mt-auto rounded-lg border border-white/[0.12] py-3 text-center font-[Lato] text-[14px] text-[#a98c88]">
                Tu plan actual
              </p>
            ) : bloqueado ? (
              <p className="mt-auto py-3 text-center font-[Lato] text-[13px] text-[#8d7470]">
                Ya incluido en tu acceso
              </p>
            ) : (
              /* ⚠️ `<a>` y NUNCA `<Link>`: en /suscripcion este href crea una
                 checkout configuration en Whop, y Next prefetchea los Link — se
                 crearían configuraciones con solo pasar el mouse. Se usa `<a>` en
                 los dos contextos para que nadie pueda equivocarse al reutilizar
                 el componente. */
              <a
                href={hrefDe(tier)}
                className={`mt-auto rounded-lg px-6 py-3 text-center text-[14px] no-underline ${
                  tier === 2 ? "lp-cta" : tier === 3 ? "jr-btn-gold" : "lp-btn"
                }`}
              >
                {copy.cta}
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** El bloque común de abajo. Con el detalle de cada cosa, no solo el nombre. */
export function IncluidoEnTodos() {
  return (
    <section className="mt-12">
      <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a98c88]">
        Todo esto está incluido en cualquier plan
      </p>
      <div className="mx-auto grid max-w-[900px] gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {INCLUIDO_EN_TODOS.map((i) => (
          <div key={i.titulo} className="flex items-start gap-2.5">
            <Check className="mt-[3px] h-4 w-4 shrink-0 text-[#e8467a]" aria-hidden />
            <div>
              <p className="font-[Lato] text-[14px] font-bold text-[#efe7e0]">{i.titulo}</p>
              <p className="mt-0.5 font-[Lato] text-[13px] leading-[1.5] text-[#a98c88]">
                {i.detalle}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
