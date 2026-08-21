/**
 * Piezas compartidas por la lista y la ficha. Server components: nada de estado.
 *
 * ⚠️ `ESTADO`, `TONO` y `fecha` son copia deliberada de app/cuenta/page.tsx, no un
 * import: aquella pantalla se los muestra al DUEÑO de la cuenta y ésta a un
 * administrador, así que los textos van a divergir (un admin quiere leer "Pago
 * pendiente" con el estado crudo al lado; el cliente, no). Compartirlos ataría dos
 * audiencias distintas al mismo copy. Lo que sí está compartido de verdad —los 9
 * estados que existen— es un hecho de Whop, y ninguno de los dos lo inventa.
 */

/** Los 9 estados de membership de Whop, en español y con el tono que les toca. */
export const ESTADO: Record<string, { texto: string; tono: "ok" | "aviso" | "malo" }> = {
  trialing: { texto: "En prueba", tono: "ok" },
  active: { texto: "Activa", tono: "ok" },
  canceling: { texto: "Cancela al fin del período", tono: "aviso" },
  past_due: { texto: "Pago pendiente", tono: "malo" },
  unresolved: { texto: "Problema de cobro", tono: "malo" },
  completed: { texto: "Finalizada", tono: "malo" },
  canceled: { texto: "Cancelada", tono: "malo" },
  expired: { texto: "Vencida", tono: "malo" },
  drafted: { texto: "Sin completar", tono: "aviso" },
};

export const TONO: Record<"ok" | "aviso" | "malo", string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  aviso: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  malo: "border-[rgba(233,61,61,0.3)] bg-[rgba(233,61,61,0.1)] text-[#fca5a5]",
};

/**
 * ⚠️ ZONA HORARIA FIJA, mismo criterio que /cuenta y que `limaSearchDay`: sin
 * `timeZone`, `toLocaleDateString` usa la del SERVIDOR (UTC en Vercel, la del equipo
 * en local) y la misma fecha se ve distinta según dónde corra.
 *
 * `instante` es para timestamps de verdad. `dia` es para un `YYYY-MM-DD` que YA es un
 * día de calendario: se parsea como medianoche UTC, así que traducirlo a Lima lo
 * correría un día hacia atrás.
 */
export const fecha = {
  instante: (iso: string) =>
    new Date(iso).toLocaleDateString("es-PE", {
      day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima",
    }),
  dia: (ymd: string) =>
    new Date(`${ymd}T00:00:00Z`).toLocaleDateString("es-PE", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }),
};

export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="jr-card rounded-2xl p-6">
      <h2 className="relative mb-1 text-[17px] text-[#f6f2eb]">{title}</h2>
      {description && (
        <p className="relative mb-4 text-[12px] leading-[1.6] text-[#a98c88]">{description}</p>
      )}
      <div className={`relative ${description ? "" : "mt-4"}`}>{children}</div>
    </section>
  );
}

export function Insignia({
  tono,
  children,
}: {
  tono: "ok" | "aviso" | "malo";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${TONO[tono]}`}
    >
      {children}
    </span>
  );
}
