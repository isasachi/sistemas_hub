"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { registrarEmpire, activarEmpire, type RegistroState } from "./actions";

const AVISO_ERROR =
  "bg-[rgba(233,61,61,0.08)] border border-[rgba(233,61,61,0.2)] rounded-xl px-3.5 py-2.5 text-[12px] text-[#fca5a5] leading-[1.5]";
const AVISO =
  "rounded-xl border border-[rgba(246,242,235,0.3)] bg-[rgba(246,242,235,0.08)] px-3.5 py-2.5 text-[12px] leading-[1.5] text-[#e8dcd6]";

/**
 * Dos caminos, una sola pantalla:
 * - sin sesión → se pide SOLO el correo; la cuenta nace sin contraseña y se entra con
 *   el enlace que llega al correo.
 * - con sesión → un botón activa Empire en la cuenta abierta.
 */
export function RegistroEmpireForm({ codigo, emailSesion }: { codigo: string; emailSesion: string | null }) {
  const [registro, registrar, pRegistro] = useActionState<RegistroState, FormData>(registrarEmpire, {});
  const [activacion, activar, pActivar] = useActionState<RegistroState, FormData>(activarEmpire, {});

  if (emailSesion) {
    return (
      <form action={activar} className="flex flex-col gap-4">
        <input type="hidden" name="codigo" value={codigo} />
        <p className="font-[Lato] text-[13px] leading-[1.5] text-[#c9b4ae]">
          Se activará en tu cuenta <span className="text-[#f6f2eb]">{emailSesion}</span>.
        </p>
        {activacion.error && <div role="alert" className={AVISO_ERROR}>{activacion.error}</div>}
        <button type="submit" disabled={pActivar} className="jr-cta w-full rounded-xl py-3 text-[14px] cursor-pointer">
          {pActivar ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Activar Legacy Empire"}
        </button>
      </form>
    );
  }

  if (registro.enviado) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="h-8 w-8 text-[#f6f2eb]" aria-hidden />
        <p className="font-[Lato] text-[14px] leading-[1.5] text-[#e8dcd6]">
          Listo, tu cuenta con Legacy Empire está creada. Te enviamos un enlace a{" "}
          <span className="text-[#f6f2eb]">{registro.enviado}</span> para entrar.
        </p>
        <p className="font-[Lato] text-[12px] leading-[1.5] text-[#a98c88]">
          Puedes abrirlo desde cualquier dispositivo; vence en 1 hora. Cuando quieras volver a entrar,
          usa “Enviarme un enlace” en la pantalla de inicio de sesión — no necesitas contraseña.
        </p>
      </div>
    );
  }

  const volver = `/registro/empire?codigo=${encodeURIComponent(codigo)}`;

  return (
    <form action={registrar} className="flex flex-col gap-4">
      <input type="hidden" name="codigo" value={codigo} />
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[12px] font-semibold text-[#c9b4ae]">
          Tu email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@email.com"
          required
          className="jr-field w-full rounded-xl px-3.5 py-2.5 text-[14px]"
        />
        <p className="mt-1.5 text-[11px] leading-[1.5] text-[#a98c88]">
          Sin contraseña: te enviaremos un enlace para entrar.
        </p>
      </div>

      {registro.error && <div role="alert" className={AVISO_ERROR}>{registro.error}</div>}
      {registro.existe && (
        <div role="status" className={AVISO}>
          Ese email ya tiene una cuenta.{" "}
          <Link
            href={`/login?next=${encodeURIComponent(volver)}`}
            className="font-semibold text-[#e8467a] no-underline hover:underline"
          >
            Inicia sesión
          </Link>{" "}
          y se te traerá de vuelta acá para activar Empire.
        </div>
      )}

      <button type="submit" disabled={pRegistro} className="jr-cta mt-1 w-full rounded-xl py-3 text-[14px] cursor-pointer">
        {pRegistro ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Crear mi cuenta"}
      </button>
    </form>
  );
}
