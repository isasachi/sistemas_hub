import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Check, Sparkles } from "lucide-react";
import { PLANS, TIERS, RAW_BUCKET_LABEL, creditosBajos, precioUSD, type Tier } from "@ph/shared";
import { getUser } from "@/lib/supabase/server";
import { getAccess, type Access } from "@/lib/whop";
import { creditStatus, type CreditStatus } from "@/lib/credits";
import { getProfile, getKieKey, maskKey } from "@/lib/user-settings";
import { PerfilForm, AvatarForm, KieKeyForm } from "./Formularios";

/**
 * "Mi cuenta": perfil, plan, créditos y la API key de KIE.
 *
 * ⚠️ VIVE FUERA DEL GRUPO `(app)`, igual que el paywall, y por el mismo motivo. Ese
 * layout redirige a `/suscripcion` a quien no tenga suscripción activa — así que
 * un usuario en `past_due` (una tarjeta rechazada, que pasa todos los meses) no
 * podría entrar a ver ni arreglar su cuenta, que es exactamente lo que necesita
 * hacer en ese momento. Acá se autentica sola y el bloque del plan sabe decir
 * "sin plan activo".
 *
 * ⚠️ NO hay datos de facturación: los comprobantes los emite Whop como
 * merchant-of-record (migración 20260820000003).
 */
export const dynamic = "force-dynamic";

/** Los 9 estados de membership de Whop, en español y con el tono que les toca. */
const ESTADO: Record<string, { texto: string; tono: "ok" | "aviso" | "malo" }> = {
  trialing: { texto: "En prueba", tono: "ok" },
  active: { texto: "Activa", tono: "ok" },
  canceling: { texto: "Activa hasta el fin del período", tono: "aviso" },
  past_due: { texto: "Pago pendiente", tono: "malo" },
  unresolved: { texto: "Problema de cobro", tono: "malo" },
  completed: { texto: "Finalizada", tono: "malo" },
  canceled: { texto: "Cancelada", tono: "malo" },
  expired: { texto: "Vencida", tono: "malo" },
  drafted: { texto: "Sin completar", tono: "aviso" },
};

const TONO: Record<"ok" | "aviso" | "malo", string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  aviso: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  malo: "border-[rgba(233,61,61,0.3)] bg-[rgba(233,61,61,0.1)] text-[#fca5a5]",
};

/**
 * ⚠️ LA ZONA HORARIA VA FIJA, y no es un detalle cosmético. Sin `timeZone`,
 * `toLocaleDateString` usa la del SERVIDOR: UTC en Vercel, la del equipo en local,
 * así que la misma renovación se veía en días distintos según dónde corriera. Es
 * el mismo criterio que ya usa `limaSearchDay` para el corte del día.
 *
 * `instante` es para timestamps de verdad (`renewal_period_end`), que se traducen
 * a la hora de Lima. `dia` es para un `YYYY-MM-DD` que YA es un día de calendario
 * (`credits.desde`): ese string se parsea como medianoche UTC, así que traducirlo
 * a Lima lo correría un día hacia atrás.
 */
const fecha = {
  instante: (iso: string) =>
    new Date(iso).toLocaleDateString("es-PE", {
      day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima",
    }),
  dia: (ymd: string) =>
    new Date(`${ymd}T00:00:00Z`).toLocaleDateString("es-PE", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    }),
};

function Card({ title, description, children }: {
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

/** Lo que incluye un plan, derivado de `PLANS` — nunca escrito a mano. */
const incluye = (t: Tier) => [
  PLANS[t].buckets.map((b) => RAW_BUCKET_LABEL[b]).join(" · "),
  `${PLANS[t].porRango} productos por rango`,
  `${PLANS[t].creditos} imágenes al mes`,
];

/** El plan actual, en grande. */
function PlanActual({ access }: { access: Access }) {
  const plan = PLANS[access.tier];
  // ⚠️ `ESTADO[...] ?? fallback`, no `(status && ESTADO[status]) ?? fallback`: con
  // `status` en string vacío el `&&` devuelve `""`, que NO es nullish, así que el
  // `??` no se dispara y la insignia queda vacía en vez de decir "sin información".
  const estado: { texto: string; tono: "ok" | "aviso" | "malo" } = access.grandfathered
    ? { texto: "Acceso de por vida", tono: "ok" }
    : ESTADO[access.status ?? ""] ?? { texto: "Sin información", tono: "aviso" };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/[0.10] p-5"
      style={{
        background:
          "linear-gradient(135deg, rgba(189,19,71,0.22) 0%, rgba(189,19,71,0.06) 45%, rgba(246,242,235,0.03) 100%)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[1px] text-[#e8467a]">
            <Sparkles className="h-3 w-3" aria-hidden />
            Tu plan
          </span>
          <p className="mt-1 text-[24px] font-extrabold leading-none text-[#f6f2eb]">
            {plan.nombre}
            <span className="ml-2 text-[15px] font-normal text-[#c9b4ae]">
              {precioUSD(plan)} / mes
            </span>
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${TONO[estado.tono]}`}>
          {estado.texto}
        </span>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {incluye(access.tier).map((linea) => (
          <li key={linea} className="flex items-center gap-1.5 text-[13px] text-[#e8dcd6]">
            <Check className="h-3.5 w-3.5 shrink-0 text-[#e8467a]" aria-hidden />
            {linea}
          </li>
        ))}
      </ul>

      {access.renewalPeriodEnd && (
        <p className="mt-4 border-t border-white/[0.08] pt-3 text-[12px] text-[#a98c88]">
          {access.status === "canceling" ? "Termina el " : "Se renueva el "}
          <span className="text-[#efe7e0]">{fecha.instante(access.renewalPeriodEnd)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Un plan al que se puede cambiar, con su checkout.
 *
 * ⚠️ `<a>` y no `<Link>`: Next prefetchea los `<Link>` a páginas, y esa URL crea una
 * checkout configuration en Whop. No queremos crear una al pasar el mouse.
 */
function CambiarA({ tier, actual }: { tier: Tier; actual: Tier }) {
  const plan = PLANS[tier];
  const sube = tier > actual;
  const Icono = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <a
      href={`/api/whop/checkout?plan=${tier}`}
      className="group flex flex-1 items-center justify-between gap-3 rounded-xl border border-white/[0.12] px-4 py-3 no-underline transition-colors hover:border-[rgba(232,70,122,0.5)] hover:bg-white/[0.04]"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-[#efe7e0]">
          {plan.nombre} · {precioUSD(plan)}
        </span>
        {/* La diferencia que importa, no la lista entera: acá el usuario compara. */}
        <span className="block truncate text-[11px] text-[#a98c88]">
          {plan.porRango} productos · {plan.creditos} imágenes
        </span>
      </span>
      <span
        className="flex shrink-0 items-center gap-1 text-[12px] font-bold"
        style={{ color: sube ? "#e8467a" : "#a98c88" }}
      >
        {sube ? "Subir" : "Bajar"}
        <Icono className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}

/** Créditos como anillo. SVG a mano: no hace falta una librería para un arco. */
function AnilloCreditos({ credits }: { credits: CreditStatus }) {
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const usadoPct = Math.min(1, credits.usados / Math.max(1, credits.limite));
  // Se avisa por lo que QUEDA, no por lo gastado: es el número que decide si
  // alcanza para terminar lo que el usuario está haciendo. El umbral es compartido
  // con el contador de la barra (`@ph/shared`), para que no digan cosas distintas.
  const bajo = creditosBajos(credits.restantes, credits.limite);
  const color = credits.restantes === 0 ? "#e93d3d" : bajo ? "#f59e0b" : "#bd1347";

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-[104px] w-[104px] shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(246,242,235,0.10)" strokeWidth="9" />
          <circle
            cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - usadoPct)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-extrabold leading-none text-[#f6f2eb]">
            {credits.restantes}
          </span>
          <span className="text-[10px] uppercase tracking-[0.5px] text-[#a98c88]">
            de {credits.limite}
          </span>
        </div>
      </div>

      <div className="min-w-[200px] flex-1">
        <p className="text-[14px] text-[#efe7e0]">
          Te quedan <strong className="font-extrabold">{credits.restantes}</strong> créditos
          {bajo && credits.restantes > 0 && (
            <span className="ml-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
              quedan pocas
            </span>
          )}
          {credits.restantes === 0 && (
            <span className="ml-1.5 rounded-full border border-[rgba(233,61,61,0.3)] bg-[rgba(233,61,61,0.1)] px-2 py-0.5 text-[11px] font-bold text-[#fca5a5]">
              sin créditos
            </span>
          )}
        </p>
        <p className="mt-1 text-[12px] text-[#a98c88]">
          Usaste {credits.usados} desde el {fecha.dia(credits.desde)}.
        </p>
        <p className="mt-3 text-[12px] leading-[1.6] text-[#8d7470]">
          Cada imagen de Anuncios, Branding o Landing consume 1 crédito. El generador de
          video y la calculadora no gastan créditos.
        </p>
      </div>
    </div>
  );
}

export default async function CuentaPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const [access, perfil, kie] = await Promise.all([
    getAccess(user.id, user.email),
    getProfile(user.id),
    getKieKey(user.id),
  ]);
  const credits = access ? await creditStatus(user.id, access) : null;
  // A un grandfathered no se le ofrece comprar: ya tiene todo.
  const otrosPlanes = access && !access.grandfathered
    ? TIERS.filter((t) => t !== access.tier)
    : [];

  return (
    <div className="min-h-screen bg-[#14050a] px-6 py-12">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <header className="mb-2">
          {/* Sin plan, "volver al panel" rebota al paywall: el layout de `(app)` lo
              manda ahí. Se le ofrece el destino que de verdad va a ver. */}
          <Link
            href={access ? "/dashboard" : "/suscripcion"}
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#a98c88] no-underline transition-colors hover:text-[#f6f2eb]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {access ? "Volver al panel" : "Ver planes"}
          </Link>
          <h1 className="lp-serif mb-1.5 text-[26px] leading-[1.15] text-[#f6f2eb]">Mi cuenta</h1>
          <p className="text-[14px] leading-[1.6] text-[#c9b4ae]">{user.email}</p>
        </header>

        <Card
          title="Tu perfil"
          description="Tu correo es el que usas para entrar y no se puede cambiar desde acá."
        >
          <div className="flex flex-col gap-6">
            <AvatarForm avatarUrl={perfil.avatarUrl} />
            <PerfilForm fullName={perfil.fullName} phone={perfil.phone} />
          </div>
        </Card>

        <Card title="Tu plan">
          {access ? (
            <>
              <PlanActual access={access} />

              {otrosPlanes.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2.5 text-[12px] uppercase tracking-[1px] text-[#a98c88]">
                    Cambiar de plan
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {otrosPlanes.map((t) => (
                      <CambiarA key={t} tier={t} actual={access.tier} />
                    ))}
                  </div>
                  {/* ⚠️ Whop crea una suscripción NUEVA; la anterior sigue cobrando
                      hasta que se cancele. Callarlo es cobrarle dos veces a alguien
                      sin avisarle. */}
                  <p className="mt-2.5 text-[11px] leading-[1.6] text-[#8d7470]">
                    Al cambiar se crea una suscripción nueva en Whop: acuérdate de cancelar
                    la anterior desde tu cuenta de Whop para no pagar las dos. El cobro y los
                    comprobantes los gestiona Whop.
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Sin suscripción activa. Esta rama es la razón por la que la página vive
               fuera de `(app)`: alguien con el pago vencido llega hasta acá. */
            <div className="flex flex-col items-start gap-3">
              <p className="text-[13px] leading-[1.6] text-[#c9b4ae]">
                No tienes un plan activo, así que las herramientas están bloqueadas. Tus
                datos y tu API key siguen guardados.
              </p>
              <Link
                href="/suscripcion"
                className="jr-cta flex items-center justify-center rounded-xl px-5 py-2.5 text-[14px] no-underline"
              >
                Ver planes
              </Link>
            </div>
          )}
        </Card>

        {credits && (
          <Card title="Créditos">
            <AnilloCreditos credits={credits} />
          </Card>
        )}

        <Card
          title="API key de KIE"
          description="El render de video lo pagas con tu propia cuenta de KIE, por eso viene incluido en los tres planes. Puedes crear tu key en kie.ai."
        >
          <KieKeyForm guardada={maskKey(kie)} />
        </Card>
      </div>
    </div>
  );
}
