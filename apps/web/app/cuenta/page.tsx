import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PLANS, RAW_BUCKET_LABEL } from "@ph/shared";
import { getUser } from "@/lib/supabase/server";
import { getAccess } from "@/lib/whop";
import { creditStatus } from "@/lib/credits";
import { getProfile, getKieKey, maskKey } from "@/lib/user-settings";
import { PerfilForm, AvatarForm, FacturacionForm, KieKeyForm } from "./Formularios";

/**
 * "Mi cuenta": perfil, plan, créditos, facturación y la API key de KIE.
 *
 * ⚠️ VIVE FUERA DEL GRUPO `(app)`, igual que el paywall, y por el mismo motivo. Ese
 * layout redirige a `/suscripcion` a quien no tenga suscripción activa — así que
 * un usuario en `past_due` (una tarjeta rechazada, que pasa todos los meses) no
 * podría entrar a ver ni corregir sus propios datos de facturación, que es
 * exactamente lo que necesita hacer en ese momento. Acá se autentica sola y el
 * bloque del plan sabe decir "sin plan activo".
 */
export const dynamic = "force-dynamic";

/** Los 9 estados de membership de Whop, en español. */
const ESTADO: Record<string, string> = {
  trialing: "En período de prueba",
  active: "Activa",
  canceling: "Activa hasta el fin del período",
  past_due: "Pago pendiente",
  completed: "Finalizada",
  canceled: "Cancelada",
  expired: "Vencida",
  unresolved: "Con un problema de cobro",
  drafted: "Sin completar",
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

export default async function CuentaPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  // Cuatro lecturas independientes: en paralelo, para que la pantalla no cueste la
  // suma de sus round-trips.
  const [access, perfil, kie] = await Promise.all([
    getAccess(user.id, user.email),
    getProfile(user.id),
    getKieKey(user.id),
  ]);
  const credits = access ? await creditStatus(user.id, access) : null;
  const plan = access ? PLANS[access.tier] : null;
  const pct = credits
    ? Math.min(100, Math.round((credits.usados / Math.max(1, credits.limite)) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-[#14050a] px-6 py-12">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <header className="mb-2">
          <Link
            href="/dashboard"
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#a98c88] no-underline transition-colors hover:text-[#f6f2eb]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al panel
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
          {plan && access ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[15px] font-extrabold text-[#efe7e0]">
                  {plan.nombre}
                  <span className="ml-2 text-[13px] font-normal text-[#a98c88]">
                    ${plan.precio} / mes
                  </span>
                </p>
                {!access.grandfathered && (
                  <Link href="/suscripcion" className="text-[13px] font-bold text-[#e8467a] no-underline">
                    Cambiar de plan
                  </Link>
                )}
              </div>

              <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-[#c9b4ae]">
                <li>Buscador: {plan.buckets.map((b) => RAW_BUCKET_LABEL[b]).join(" · ")}</li>
                <li>{plan.porRango} productos por rango</li>
                <li>{plan.creditos} imágenes por período</li>
              </ul>

              {/* Lo que el hub sabe de la suscripción. NO hay historial de pagos:
                  el cobro lo hace Whop y el hub no guarda los pagos (ver la
                  migración 20260820000002). Se muestra lo que es dato real. */}
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/[0.08] pt-4 text-[13px]">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.5px] text-[#a98c88]">Estado</dt>
                  <dd className="mt-0.5 text-[#efe7e0]">
                    {access.grandfathered
                      ? "Acceso de por vida"
                      : (access.status && ESTADO[access.status]) ?? "Sin información"}
                  </dd>
                </div>
                {access.renewalPeriodEnd && (
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.5px] text-[#a98c88]">
                      {access.status === "canceling" ? "Termina el" : "Se renueva el"}
                    </dt>
                    <dd className="mt-0.5 text-[#efe7e0]">{fecha.instante(access.renewalPeriodEnd)}</dd>
                  </div>
                )}
              </dl>

              {!access.grandfathered && (
                <p className="mt-4 text-[12px] leading-[1.6] text-[#8d7470]">
                  El cobro y los comprobantes de pago los gestiona Whop. Desde tu cuenta
                  de Whop puedes ver tus pagos, cambiar la tarjeta o cancelar.
                </p>
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
          <Card title="Créditos de imagen">
            <p className="mb-2 text-[13px] text-[#c9b4ae]">
              <span className="text-[20px] font-extrabold text-[#efe7e0]">{credits.restantes}</span>
              {" "}de {credits.limite} disponibles · período desde el {fecha.dia(credits.desde)}
            </p>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
              role="progressbar"
              aria-valuenow={credits.usados}
              aria-valuemin={0}
              aria-valuemax={credits.limite}
            >
              <div className="h-full rounded-full bg-[#bd1347]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-[12px] leading-[1.6] text-[#a98c88]">
              Cada imagen de Anuncios, Branding o Landing consume 1 crédito. El generador
              de video y la calculadora de costos no gastan créditos.
            </p>
          </Card>
        )}

        {/* ⚠️ El texto dice la verdad a propósito: hoy nadie emite estos comprobantes.
            Pedir datos fiscales dando a entender que ya se factura es una promesa que
            el producto no cumple. */}
        <Card
          title="Datos de facturación"
          description="Los guardamos para cuando emitamos comprobantes. Hoy el cobro lo procesa Whop y la boleta o factura sale de su lado, no del nuestro."
        >
          <FacturacionForm
            billingName={perfil.billingName}
            taxId={perfil.taxId}
            billingAddress={perfil.billingAddress}
          />
        </Card>

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
