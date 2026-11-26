import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getAccess } from "@/lib/whop";
import { codigoEmpireValido } from "@/lib/cortesia-empire";
import { RegistroEmpireForm } from "./RegistroEmpireForm";

/**
 * `/registro/empire?codigo=X` — alta free directo a Legacy Empire de cortesía.
 *
 * Vive en el grupo `(auth)` solo por el layout; `proxy.ts` NO la trata como página de
 * auth, así que alguien logueado se queda acá (y no rebota al dashboard) para poder
 * activar Empire en su cuenta existente.
 */
export default async function RegistroEmpirePage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo = "" } = await searchParams;

  if (!codigoEmpireValido(codigo)) {
    return (
      <Tarjeta titulo="Invitación no válida">
        <p className="font-[Lato] text-[13px] leading-[1.5] text-[#c9b4ae]">
          Este enlace de invitación no es válido o ya no está vigente. Pídele uno nuevo a quien te lo
          compartió.
        </p>
        <Link href="/login" className="mt-5 inline-block text-[13px] font-semibold text-[#e8467a] no-underline hover:underline">
          Ir a iniciar sesión
        </Link>
      </Tarjeta>
    );
  }

  const user = await getUser();
  const access = user ? await getAccess(user.id, user.email) : null;

  if (user && access?.tier === 3) {
    return (
      <Tarjeta titulo="Ya tienes Legacy Empire">
        <p className="font-[Lato] text-[13px] leading-[1.5] text-[#c9b4ae]">
          Tu cuenta {user.email} ya tiene el plan Legacy Empire activo.
        </p>
        <Link href="/dashboard" className="jr-cta mt-5 block w-full rounded-xl py-3 text-center text-[14px] no-underline">
          Ir al panel
        </Link>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="Activa Legacy Empire gratis" subtitulo="Te invitaron a usar todas las herramientas del plan Empire, de cortesía.">
      <RegistroEmpireForm codigo={codigo} emailSesion={user?.email ?? null} />
    </Tarjeta>
  );
}

function Tarjeta({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="jr-card lp-leak jr-rise w-full max-w-[400px] rounded-2xl p-7">
      <h1 className="relative mb-1 text-[22px] text-[#f6f2eb]">{titulo}</h1>
      {subtitulo && (
        <p className="relative mb-6 font-[Lato] text-[13px] leading-[1.5] text-[#c9b4ae]">{subtitulo}</p>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
