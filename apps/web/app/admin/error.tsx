"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Qué se ve cuando una consulta del panel falla.
 *
 * ⚠️ Existe por `auth.admin.listUsers()`, la única lectura del panel que NO fail-abre:
 * el resto devuelve vacío ante un error de DB, pero una lista de usuarios silenciosa
 * en cero es un éxito falso — parecería que el hub no tiene clientes. Por eso esa
 * lectura lanza… y por eso hace falta esto, si no un fallo suyo deja la pantalla en
 * blanco sin decir por qué.
 *
 * ponytail: es el límite de error nativo de Next (`error.tsx`), no un try/catch en
 * cada página. Un archivo cubre la lista y la ficha, y trae el botón de reintento.
 *
 * El caso más probable no es una caída de Supabase: es la migración
 * 20260821000001 sin aplicar, o `SUPABASE_SERVICE_ROLE_KEY` ausente — por eso el
 * mensaje los nombra en vez de decir "algo salió mal".
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="jr-card rounded-2xl p-6">
      <h2 className="relative mb-2 flex items-center gap-2 text-[17px] text-[#f6f2eb]">
        <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
        No pudimos leer el panel
      </h2>
      <p className="relative text-[13px] leading-[1.6] text-[#c9b4ae]">
        Suele ser la migración <code className="text-[#e8467a]">20260821000001_user_roles</code>{" "}
        sin aplicar en Supabase, o la service role key ausente en este entorno.
      </p>
      <p className="relative mt-2 break-words font-[Lato] text-[12px] text-[#8d7470]">
        {error.message}
        {error.digest && ` (${error.digest})`}
      </p>
      <div className="relative mt-4 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="jr-cta cursor-pointer rounded-xl px-5 py-2.5 text-[13px]"
        >
          Reintentar
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-white/[0.12] px-5 py-2.5 text-[13px] text-[#efe7e0] no-underline transition-colors hover:border-[rgba(232,70,122,0.5)]"
        >
          Volver al panel
        </Link>
      </div>
    </section>
  );
}
