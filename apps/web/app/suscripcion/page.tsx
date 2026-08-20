import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { hasAccess } from "@/lib/whop";

/**
 * Paywall. Vive FUERA del grupo `(app)` a propósito: su layout redirige a esta
 * página cuando falta la suscripción, así que tenerla adentro sería un loop.
 */
const INCLUYE = [
  "Generador de anuncios estáticos",
  "Generador de video ads UGC",
  "Generador de branding y landings",
  "Buscador de productos ganadores",
];

const ERRORES: Record<string, string> = {
  checkout: "No pudimos abrir el checkout. Intenta de nuevo en un momento.",
};

export default async function SuscripcionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  // Un usuario que ya pagó no tiene nada que hacer acá (por ejemplo, al volver del
  // checkout con el webhook ya procesado).
  if (await hasAccess(user.id, user.email)) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-[#14050a]">
      <div className="jr-card w-full max-w-[420px] rounded-2xl p-7">
        <h1 className="relative mb-1 text-[22px] text-[#f6f2eb]">Activa tu acceso</h1>
        <p className="relative mb-6 font-[Archivo] text-[13px] leading-[1.5] text-[#c9b4ae]">
          Prueba 3 días gratis. Luego $29 al mes, cancelas cuando quieras.
        </p>

        <ul className="relative mb-6 flex flex-col gap-2.5">
          {INCLUYE.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[13px] text-[#e8dcd6]">
              <Check className="mt-0.5 w-4 h-4 shrink-0 text-[#e8467a]" aria-hidden />
              {item}
            </li>
          ))}
        </ul>

        {error && ERRORES[error] && (
          <div
            role="alert"
            className="relative mb-4 rounded-xl border border-[rgba(233,61,61,0.2)] bg-[rgba(233,61,61,0.08)] px-3.5 py-2.5 text-[12px] leading-[1.5] text-[#fca5a5]"
          >
            {ERRORES[error]}
          </div>
        )}

        {/* `<a>` y no `<Link>`: Next prefetchea los Link a páginas, y esta URL crea una
            checkout configuration en Whop. No queremos crear una al pasar el mouse. */}
        <a
          href="/api/whop/checkout"
          className="jr-cta relative flex w-full items-center justify-center rounded-xl py-3 text-[14px] no-underline"
        >
          Empezar prueba gratis
        </a>

        <p className="relative mt-5 text-center text-[13px] text-[#a98c88]">
          Sesión iniciada como {user.email}
        </p>
      </div>
    </div>
  );
}
