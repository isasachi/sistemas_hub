import { redirect } from "next/navigation";
import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { PLANS, TIERS, RAW_BUCKET_LABEL, lockedBuckets, type Tier } from "@ph/shared";
import { getUser } from "@/lib/supabase/server";
import { getAccess, type Access } from "@/lib/whop";

/**
 * Paywall Y página de cambio de plan. Vive FUERA del grupo `(app)` a propósito:
 * su layout redirige acá cuando falta la suscripción, así que tenerla adentro
 * sería un loop.
 *
 * ⚠️ NO REDIRIGE A QUIEN YA PAGÓ, y eso es deliberado. Con un plan único, "ya
 * tiene acceso → al dashboard" era correcto: no había nada que hacer acá. Con
 * tres planes esa misma línea deja la página inalcanzable justo para quien
 * necesita verla — un usuario del plan 1 que quiere subir al 3 rebotaba al
 * dashboard. La única redirección que queda es la de `pago=ok`.
 *
 * ⚠️ Lo que promete cada card sale de `PLANS` (@ph/shared), que es la misma
 * fuente que usa el servidor para servir. Escribir "10 productos" a mano acá es
 * cómo el paywall termina vendiendo algo que el buscador no entrega.
 */

/**
 * Días de prueba. ⚠️ Whop ata el free trial al CHECKOUT LINK, no al plan, así que
 * este número es cierto solo si los tres links se configuraron con él. Si algún
 * link va sin prueba, se cambia esta constante (o se saca la línea) — una promesa
 * de prueba que el checkout no cumple es peor que no prometerla.
 */
const PRUEBA_DIAS = 3;

/** Incluido en los tres planes, sin tope por tier. */
const INCLUYE_TODOS = [
  "Generador de anuncios estáticos",
  "Generador de branding y landings",
  "Calculadora de costos",
  "Generador de video ads UGC (con tu propia API key de KIE)",
];

const ERRORES: Record<string, string> = {
  checkout: "No pudimos abrir el checkout. Intenta de nuevo en un momento.",
  plan: "Ese plan no existe. Elige uno de los tres.",
};

/** Lo que distingue a este plan de los otros, derivado de `PLANS`. */
function ventajas(tier: Tier): string[] {
  const p = PLANS[tier];
  return [
    `Buscador: ${p.buckets.map((b) => RAW_BUCKET_LABEL[b]).join(" · ")}`,
    `${p.porRango} productos por rango`,
    `${p.creditos} imágenes al mes`,
  ];
}

function PlanCard({ tier, actual, bloqueado }: {
  tier: Tier;
  /** El plan que el usuario ya tiene. */
  actual: boolean;
  /** Tiene acceso de por vida: no hay nada que comprar. */
  bloqueado: boolean;
}) {
  const p = PLANS[tier];
  const destacado = tier === 3 && !actual;
  return (
    <div
      className="jr-card relative flex flex-col rounded-2xl p-6"
      style={
        actual
          ? { borderColor: "rgba(255,255,255,0.28)" }
          : destacado
            ? { borderColor: "rgba(232,70,122,0.45)" }
            : undefined
      }
    >
      {(actual || destacado) && (
        <span
          className="absolute -top-2.5 left-6 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px]"
          style={
            actual
              ? { background: "rgba(246,242,235,0.16)", color: "#f6f2eb" }
              : { background: "#bd1347", color: "#f6f2eb" }
          }
        >
          {actual ? "Tu plan" : "Más completo"}
        </span>
      )}
      <h2 className="relative text-[18px] text-[#f6f2eb]">{p.nombre}</h2>
      <p className="relative mb-5 mt-1 text-[13px] text-[#c9b4ae]">
        <span className="text-[28px] font-extrabold text-[#f6f2eb]">${p.precio}</span>
        <span className="ml-1">/ mes</span>
      </p>

      <ul className="relative mb-5 flex flex-col gap-2">
        {ventajas(tier).map((v) => (
          <li key={v} className="flex items-start gap-2.5 text-[13px] text-[#e8dcd6]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#e8467a]" aria-hidden />
            {v}
          </li>
        ))}
        {/* Lo que este plan NO desbloquea se dice acá, no se esconde: el
            buscador va a mostrar esos rangos con candado igual. */}
        {lockedBuckets(tier).map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-[13px] text-[#8d7470]">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {RAW_BUCKET_LABEL[b]}
          </li>
        ))}
      </ul>

      {actual ? (
        <p className="relative mt-auto rounded-xl border border-white/[0.12] py-3 text-center text-[14px] text-[#a98c88]">
          Tu plan actual
        </p>
      ) : bloqueado ? (
        <p className="relative mt-auto py-3 text-center text-[13px] text-[#8d7470]">
          Ya incluido en tu acceso
        </p>
      ) : (
        <a
          href={`/api/whop/checkout?plan=${tier}`}
          className={`relative mt-auto flex w-full items-center justify-center rounded-xl py-3 text-[14px] no-underline ${
            destacado
              ? "jr-cta"
              : "border border-white/[0.14] text-[#efe7e0] transition-colors hover:bg-white/[0.05]"
          }`}
        >
          {PRUEBA_DIAS > 0 ? "Empezar prueba gratis" : "Suscribirme"}
        </a>
      )}
    </div>
  );
}

export default async function SuscripcionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; pago?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const access: Access | null = await getAccess(user.id, user.email);
  const { error, pago } = await searchParams;

  // Volvió del checkout pero su fila todavía no existe: el redirect del navegador y
  // la entrega del webhook compiten. Mostrarle el paywall acá se lee como "mi pago
  // falló" y termina en un pedido de reembolso.
  //
  // ponytail: refresco manual, sin polling ni client component. Un auto-refresh
  // giraría para siempre si el webhook nunca llega. Si aparecen consultas de soporte
  // por esta pantalla, el upgrade es un client component que reintenta N veces y
  // después muestra un contacto.
  if (pago === "ok") {
    if (access) redirect("/dashboard"); // el webhook ya llegó
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#14050a] px-6 py-10">
        <div className="jr-card w-full max-w-[420px] rounded-2xl p-7 text-center">
          <h1 className="relative mb-1 text-[22px] text-[#f6f2eb]">
            Estamos confirmando tu pago
          </h1>
          <p className="relative mb-6 text-[13px] leading-[1.5] text-[#c9b4ae]">
            Suele tardar unos segundos. Tu acceso se activa solo.
          </p>
          <a
            href="/suscripcion?pago=ok"
            className="jr-cta relative flex w-full items-center justify-center rounded-xl py-3 text-[14px] no-underline"
          >
            Actualizar
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#14050a] px-6 py-12">
      <div className="mx-auto w-full max-w-[1000px]">
        <header className="mb-9 text-center">
          <h1 className="mb-1.5 text-[26px] text-[#f6f2eb]">
            {access ? "Planes" : "Activa tu acceso"}
          </h1>
          <p className="text-[14px] leading-[1.6] text-[#c9b4ae]">
            {access
              ? "Tu plan actual está marcado abajo."
              : `Prueba ${PRUEBA_DIAS} días gratis en cualquier plan. Cancelas cuando quieras.`}
          </p>
        </header>

        {error && ERRORES[error] && (
          <div
            role="alert"
            className="mx-auto mb-6 max-w-[560px] rounded-xl border border-[rgba(233,61,61,0.2)] bg-[rgba(233,61,61,0.08)] px-3.5 py-2.5 text-[12px] leading-[1.5] text-[#fca5a5]"
          >
            {ERRORES[error]}
          </div>
        )}

        {/* ⚠️ Cambiar de plan crea una suscripción NUEVA en Whop; la anterior sigue
            cobrando hasta que se cancele. No se resuelve solo desde acá (haría falta
            la API de cambio de plan de Whop, o cancelar la vieja en su dashboard), y
            callarlo es cobrarle dos veces a alguien sin avisarle. */}
        {access && !access.grandfathered && (
          <div className="mx-auto mb-6 max-w-[560px] rounded-xl border border-white/[0.12] bg-white/[0.03] px-3.5 py-2.5 text-[12px] leading-[1.6] text-[#c9b4ae]">
            Si contratas otro plan se crea una suscripción nueva: acuérdate de cancelar
            la anterior desde tu cuenta de Whop para no pagar las dos.
          </div>
        )}

        {/* `<a>` y no `<Link>`: Next prefetchea los Link a páginas, y esas URLs crean
            una checkout configuration en Whop. No queremos crear una al pasar el
            mouse — y con tres planes serían tres. */}
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <PlanCard
              key={t}
              tier={t}
              actual={!access?.grandfathered && access?.tier === t}
              bloqueado={access?.grandfathered === true}
            />
          ))}
        </div>

        <section className="mt-9 text-center">
          <p className="mb-3 text-[12px] uppercase tracking-[1px] text-[#a98c88]">
            En los tres planes
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {INCLUYE_TODOS.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[13px] text-[#e8dcd6]">
                <Check className="h-4 w-4 shrink-0 text-[#e8467a]" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-center text-[13px] text-[#a98c88]">
          Sesión iniciada como {user.email}
          {/* Sin esta salida, quien ya tiene acceso queda encerrado en el paywall:
              la página dejó de redirigirlo al dashboard. */}
          {access && (
            <>
              {" · "}
              <Link href="/dashboard" className="font-bold text-[#e8467a] no-underline">
                Volver al panel
              </Link>
            </>
          )}
          {/* ⚠️ Y ESTA ES LA SALIDA DE QUIEN NO TIENE PLAN. El enlace a /cuenta vive
              en la barra del panel, que solo se pinta dentro del grupo `(app)` — o
              sea justo donde un usuario con el plan vencido no puede entrar. Sin
              esta línea, "Mi cuenta" existe pero solo se alcanza escribiendo la URL,
              y de nada sirve haberla sacado de `(app)` para que él pudiera verla. */}
          {" · "}
          <Link href="/cuenta" className="font-bold text-[#e8467a] no-underline">
            Mi cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
