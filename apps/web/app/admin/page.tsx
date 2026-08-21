import Link from "next/link";
import { ArrowLeft, Search, ShieldCheck, Gift } from "lucide-react";
import { PLANS } from "@ph/shared";
import { listUsuarios, consumo, type AdminUser } from "@/lib/admin";
import { ESTADO, TONO, fecha, Card, Insignia } from "./ui";

/**
 * Lista de usuarios del hub.
 *
 * ⚠️ La búsqueda es un <form method="get"> y el filtrado corre en el servidor sobre la
 * lista ya traída. Sin estado de cliente, sin fetch y sin debounce: son 3 consultas
 * fijas y el filtro es un `.includes()`. A la escala de hoy (decenas de usuarios) un
 * buscador reactivo sería infraestructura para nadie.
 */
export const dynamic = "force-dynamic";

/** Qué se ve en la columna de acceso: da acceso, se le venció, o nunca tuvo. */
function estadoDe(u: AdminUser): { texto: string; tono: "ok" | "aviso" | "malo" } {
  if (u.access?.grandfathered) return { texto: "Acceso de por vida", tono: "ok" };
  if (u.access) {
    return u.manual
      ? { texto: "Cortesía", tono: "ok" }
      : (ESTADO[u.access.status ?? ""] ?? { texto: "Activa", tono: "ok" });
  }
  // Sin acceso: el último estado conocido es lo que distingue "se le venció la
  // tarjeta" de "nunca compró", y es lo que decide qué hacer con esta persona.
  if (u.ultimoEstado) return ESTADO[u.ultimoEstado] ?? { texto: u.ultimoEstado, tono: "malo" };
  return { texto: "Sin plan", tono: "aviso" };
}

const coincide = (u: AdminUser, q: string) =>
  !q || `${u.email ?? ""} ${u.fullName ?? ""}`.toLowerCase().includes(q.toLowerCase());

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [usuarios, gasto] = await Promise.all([listUsuarios(), consumo(30)]);
  const visibles = usuarios.filter((u) => coincide(u, q));

  const conAcceso = usuarios.filter((u) => u.access).length;
  const nombre = new Map(usuarios.map((u) => [u.id, u.email ?? u.id]));

  return (
    <>
      <header className="mb-2">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#a98c88] no-underline transition-colors hover:text-[#f6f2eb]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al panel
        </Link>
        <h1 className="lp-serif mb-1.5 text-[26px] leading-[1.15] text-[#f6f2eb]">Usuarios</h1>
        <p className="text-[14px] leading-[1.6] text-[#c9b4ae]">
          {usuarios.length} en total · {conAcceso} con acceso al hub
        </p>
      </header>

      {/* ── Consumo: la única visibilidad que existe del costo real ───────────── */}
      <Card
        title="Consumo de los últimos 30 días"
        description="Cada fila de ph_gen_usage es una generación que ya se pagó a Gemini u OpenAI. Es lo más cerca que estamos de ver el costo del hub."
      >
        <div className="flex flex-wrap gap-6">
          <Cifra valor={gasto.total} etiqueta="generaciones" />
          <Cifra valor={gasto.imagenes} etiqueta="gastaron crédito" />
          <Cifra valor={gasto.hoy} etiqueta="hoy" />
        </div>

        {gasto.porKind.length > 0 && (
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Ranking
              titulo="Por tipo de generación"
              filas={gasto.porKind.slice(0, 8).map((k) => ({ label: k.kind, total: k.total }))}
            />
            <Ranking
              titulo="Quién más consume"
              filas={gasto.porUsuario.slice(0, 8).map((u) => ({
                label: nombre.get(u.userId) ?? u.userId,
                total: u.total,
                href: nombre.has(u.userId) ? `/admin/${u.userId}` : undefined,
              }))}
            />
          </div>
        )}
      </Card>

      <Card title="Todos los usuarios">
        <form method="get" className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a98c88]" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por correo o nombre"
              className="w-full rounded-xl border border-white/[0.12] bg-white/[0.03] py-2.5 pl-9 pr-3 text-[13px] text-[#f6f2eb] outline-none placeholder:text-[#8d7470] focus:border-[rgba(232,70,122,0.5)]"
            />
          </div>
          <button
            type="submit"
            className="cursor-pointer rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-[13px] text-[#efe7e0] transition-colors hover:border-[rgba(232,70,122,0.5)]"
          >
            Buscar
          </button>
        </form>

        {visibles.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[#a98c88]">
            {q ? `Nadie coincide con “${q}”.` : "Todavía no hay usuarios."}
          </p>
        ) : (
          /* ⚠️ La tabla scrollea DENTRO de su contenedor: en móvil, sin esto, la
             página entera se va de ancho. */
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[0.12em] text-[#a98c88]">
                  <Th>Usuario</Th>
                  <Th>Plan</Th>
                  <Th>Acceso</Th>
                  <Th>Alta</Th>
                  <Th>Último ingreso</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => {
                  const estado = estadoDe(u);
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-white/[0.05] transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="py-3 pr-4 align-top">
                        <Link
                          href={`/admin/${u.id}`}
                          className="text-[13px] text-[#f6f2eb] no-underline hover:text-[#e8467a]"
                        >
                          {u.email ?? "(sin correo)"}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {u.fullName && (
                            <span className="text-[11px] text-[#a98c88]">{u.fullName}</span>
                          )}
                          {u.role === "admin" && (
                            <Insignia tono="ok">
                              <ShieldCheck className="h-3 w-3" aria-hidden /> Admin
                            </Insignia>
                          )}
                          {u.creditBonus > 0 && (
                            <Insignia tono="aviso">
                              <Gift className="h-3 w-3" aria-hidden /> +{u.creditBonus}
                            </Insignia>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top text-[13px] text-[#c9b4ae]">
                        {u.access ? PLANS[u.access.tier].nombre : "—"}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONO[estado.tono]}`}
                        >
                          {estado.texto}
                        </span>
                      </td>
                      <td className="py-3 pr-4 align-top text-[12px] text-[#a98c88]">
                        {u.createdAt ? fecha.instante(u.createdAt) : "—"}
                      </td>
                      <td className="py-3 align-top text-[12px] text-[#a98c88]">
                        {u.lastSignInAt ? fecha.instante(u.lastSignInAt) : "Nunca entró"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="pb-2 pr-4 font-semibold">{children}</th>
);

function Cifra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div>
      <p className="text-[24px] font-extrabold leading-none text-[#f6f2eb]">{valor}</p>
      <p className="mt-1 text-[12px] text-[#a98c88]">{etiqueta}</p>
    </div>
  );
}

function Ranking({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { label: string; total: number; href?: string }[];
}) {
  const max = Math.max(...filas.map((f) => f.total), 1);
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-[#a98c88]">{titulo}</p>
      <ul className="flex list-none flex-col gap-1.5 p-0">
        {filas.map((f) => (
          <li key={f.label} className="flex items-center gap-3">
            <span className="w-[55%] truncate text-[12px] text-[#c9b4ae]">
              {f.href ? (
                <Link href={f.href} className="text-[#c9b4ae] no-underline hover:text-[#e8467a]">
                  {f.label}
                </Link>
              ) : (
                f.label
              )}
            </span>
            {/* Barra proporcional: comparar 8 números pegados es más rápido con
                largo que leyendo cifras. */}
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="block h-full rounded-full bg-[#bd1347]"
                style={{ width: `${Math.round((f.total / max) * 100)}%` }}
              />
            </span>
            <span className="w-10 text-right text-[12px] font-bold text-[#efe7e0]">{f.total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
