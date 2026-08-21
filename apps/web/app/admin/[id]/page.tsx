import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Gift } from "lucide-react";
import { PLANS, precioUSD } from "@ph/shared";
import { getUsuario, creditosDe, consumo, actividad } from "@/lib/admin";
import { currentAdmin } from "@/lib/roles";
import { ESTADO, TONO, fecha, Card, Insignia } from "../ui";
import { RolForm, AccesoForm, CreditosForm } from "../Acciones";

export const dynamic = "force-dynamic";

export default async function FichaUsuario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [u, admin] = await Promise.all([getUsuario(id), currentAdmin()]);
  if (!u) notFound();

  const [credits, gasto, act] = await Promise.all([
    creditosDe(u),
    consumo(30, u.id),
    actividad(u.id),
  ]);

  const estado = u.access?.grandfathered
    ? { texto: "Acceso de por vida", tono: "ok" as const }
    : u.access
      ? (ESTADO[u.access.status ?? ""] ?? { texto: "Activa", tono: "ok" as const })
      : u.ultimoEstado
        ? (ESTADO[u.ultimoEstado] ?? { texto: u.ultimoEstado, tono: "malo" as const })
        : { texto: "Sin plan", tono: "aviso" as const };

  return (
    <>
      <header className="mb-2">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#a98c88] no-underline transition-colors hover:text-[#f6f2eb]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a usuarios
        </Link>
        <h1 className="lp-serif mb-1.5 flex flex-wrap items-center gap-2 text-[26px] leading-[1.15] text-[#f6f2eb]">
          {u.email ?? "(sin correo)"}
          {u.role === "admin" && (
            <Insignia tono="ok">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Admin
            </Insignia>
          )}
        </h1>
        <p className="text-[14px] leading-[1.6] text-[#c9b4ae]">
          {u.fullName ?? "Sin nombre"} · alta{" "}
          {u.createdAt ? fecha.instante(u.createdAt) : "desconocida"} · último ingreso{" "}
          {u.lastSignInAt ? fecha.instante(u.lastSignInAt) : "nunca"}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Plan y acceso">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[22px] font-extrabold leading-none text-[#f6f2eb]">
              {u.access ? PLANS[u.access.tier].nombre : "Sin plan"}
              {u.access && (
                <span className="ml-2 text-[14px] font-normal text-[#c9b4ae]">
                  {precioUSD(PLANS[u.access.tier])} / mes
                </span>
              )}
            </p>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${TONO[estado.tono]}`}>
              {estado.texto}
            </span>
            {u.manual && <Insignia tono="aviso">Cortesía</Insignia>}
          </div>

          <dl className="mt-4 flex flex-col gap-1.5 text-[12px]">
            <Dato k="Renovación">
              {u.access?.renewalPeriodEnd ? fecha.instante(u.access.renewalPeriodEnd) : "—"}
            </Dato>
            {u.access?.bajaA && (
              <Dato k="Baja en curso">
                pasa a {PLANS[u.access.bajaA].nombre} al terminar el período
              </Dato>
            )}
            <Dato k="Estado crudo de Whop">{u.access?.status ?? u.ultimoEstado ?? "—"}</Dato>
          </dl>
        </Card>

        <Card title="Créditos del período">
          <p className="text-[22px] font-extrabold leading-none text-[#f6f2eb]">
            {credits.restantes}
            <span className="ml-2 text-[14px] font-normal text-[#c9b4ae]">
              de {credits.limite}
            </span>
          </p>
          <p className="mt-2 text-[12px] text-[#a98c88]">
            Usó {credits.usados} desde el {fecha.dia(credits.desde)}.
          </p>
          {u.creditBonus > 0 && (
            <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-amber-300">
              <Gift className="h-3.5 w-3.5" aria-hidden />
              Incluye {u.creditBonus} de cortesía sobre los {PLANS[credits.tier].creditos} del plan.
            </p>
          )}
        </Card>
      </div>

      <Card
        title="Consumo de los últimos 30 días"
        description="Generaciones que este usuario ya le costó al hub. Las de video no gastan crédito (el render lo paga con su propia key de KIE) pero sí cuestan análisis."
      >
        {gasto.total === 0 ? (
          <p className="text-[13px] text-[#a98c88]">No generó nada en este período.</p>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-[#efe7e0]">
              <strong className="font-extrabold">{gasto.total}</strong> generaciones ·{" "}
              {gasto.imagenes} gastaron crédito
            </p>
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {gasto.porKind.map((k) => (
                <li
                  key={k.kind}
                  className="rounded-full border border-white/[0.10] bg-white/[0.03] px-2.5 py-1 text-[12px] text-[#c9b4ae]"
                >
                  {k.kind} <strong className="ml-1 text-[#efe7e0]">{k.total}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card
        title="Actividad por herramienta"
        description="Sesiones abiertas en cada tool. Sirve para saber qué usó de verdad antes de responderle un reclamo."
      >
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {act.map((a) => (
            <div key={a.tool} className="rounded-xl border border-white/[0.08] p-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#a98c88]">{a.tool}</p>
              <p className="mt-1 text-[20px] font-extrabold leading-none text-[#f6f2eb]">
                {a.total}
              </p>
              <p className="mt-1 text-[11px] text-[#8d7470]">
                {a.ultima ? `última ${fecha.instante(a.ultima)}` : "sin sesiones"}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Acciones ─────────────────────────────────────────────────────────── */}
      <Card
        title="Acceso de cortesía"
        description="Escribe una suscripción a mano, sin pasar por Whop. Es el arreglo cuando alguien pagó y el webhook no llegó: convive con su membership real y manda el plan más alto de los dos."
      >
        <AccesoForm userId={u.id} tierActual={u.manual ? (u.access?.tier ?? null) : null} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title="Créditos de cortesía"
          description="Se SUMAN al límite de su plan, en este período y en los siguientes. No borra su consumo: esas filas son la única visibilidad del costo real."
        >
          <CreditosForm userId={u.id} bonus={u.creditBonus} plan={PLANS[credits.tier].creditos} />
        </Card>

        <Card
          title="Rol"
          description="Un administrador ve este panel y puede otorgar acceso y créditos a cualquiera."
        >
          <RolForm userId={u.id} role={u.role} esYoMismo={admin?.id === u.id} />
        </Card>
      </div>
    </>
  );
}

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#a98c88]">{k}</dt>
      <dd className="m-0 text-right text-[#efe7e0]">{children}</dd>
    </div>
  );
}
