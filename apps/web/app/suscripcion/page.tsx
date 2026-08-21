import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getAccess, type Access } from "@/lib/whop";
import { PlanesGrid, IncluidoEnTodos } from "@/components/planes/PlanesGrid";

/**
 * Paywall Y página de cambio de plan. Vive FUERA del grupo `(app)` a propósito:
 * su layout redirige acá cuando falta la suscripción, así que tenerla adentro
 * sería un loop.
 *
 * ⚠️ NO REDIRIGE A QUIEN YA PAGÓ, y eso es deliberado. Con un plan único, "ya
 * tiene acceso → al dashboard" era correcto: no había nada que hacer acá. Con
 * tres planes esa misma línea deja la página inalcanzable justo para quien
 * necesita verla — un usuario de Start que quiere subir a Empire rebotaba al
 * dashboard. La única redirección que queda es la de `pago=ok`.
 *
 * ⚠️ La tabla la pinta `PlanesGrid`, el MISMO componente que usa la home. Dos
 * tablas de precios separadas = una miente; ya pasó (la home vendía planes que
 * no existían).
 */

// ⚠️ NO HAY PRUEBA GRATIS, y esta pantalla no puede prometerla. Hubo una constante
// `PRUEBA_DIAS = 3` acá, con la advertencia de que solo era cierta si los checkout
// links la traían. No la traen: verificado contra la API de Whop el 2026-08-21,
// `trial_period_days` es null en los tres planes, y `createCheckout` tampoco manda
// ningún campo de prueba. Si algún día se habilita, se cambia el copy Y se verifica
// contra la API — no al revés.

const ERRORES: Record<string, string> = {
  checkout: "No pudimos abrir el checkout. Intenta de nuevo en un momento.",
  plan: "Ese plan no existe. Elige uno de los tres.",
};

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
              : "Elige tu plan y empieza hoy. Cancelas cuando quieras."}
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

        <PlanesGrid
          hrefDe={(t) => `/api/whop/checkout?plan=${t}`}
          actual={access?.grandfathered ? null : access?.tier ?? null}
          bloqueado={access?.grandfathered === true}
        />

        <IncluidoEnTodos />

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
