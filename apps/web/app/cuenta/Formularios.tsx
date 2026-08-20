"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2, Upload, User } from "lucide-react";
import {
  guardarPerfil, guardarKieKey, subirAvatar, quitarAvatar,
  type FormState,
} from "./actions";

// Los formularios de la cuenta en un archivo: comparten el input, el botón y el
// mensaje de estado, y separarlos serían tres archivos de doce líneas.

const INPUT =
  "w-full rounded-xl border border-white/[0.12] bg-[#1e0811] px-3.5 py-2.5 text-[13px] text-[#efe7e0] placeholder:text-[#8d7470]";

function Campo({ label, name, defaultValue, placeholder, type = "text", maxLength, hint }: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-[#a98c88]">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        className={INPUT}
      />
      {hint && <span className="text-[11px] text-[#8d7470]">{hint}</span>}
    </label>
  );
}

function Estado({ state }: { state: FormState }) {
  if (!state.error && !state.ok) return null;
  return (
    <p
      role="status"
      className={`text-[12px] ${state.error ? "text-[#fca5a5]" : "text-emerald-300"}`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

function Guardar({ pending, children = "Guardar" }: { pending: boolean; children?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="jr-cta flex items-center justify-center gap-2 self-start rounded-xl px-5 py-2.5 text-[13px] disabled:opacity-40"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

const INICIAL: FormState = {};

export function PerfilForm({ fullName, phone }: { fullName: string | null; phone: string | null }) {
  const [state, action, pending] = useActionState(guardarPerfil, INICIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Nombre" name="fullName" defaultValue={fullName} maxLength={80}
          placeholder="Cómo quieres que te llamemos" />
        <Campo label="Teléfono" name="phone" type="tel" defaultValue={phone} maxLength={30}
          placeholder="+51 999 999 999" />
      </div>
      <Guardar pending={pending} />
      <Estado state={state} />
    </form>
  );
}

export function AvatarForm({ avatarUrl }: { avatarUrl: string | null }) {
  const [state, action, pending] = useActionState(subirAvatar, INICIAL);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Vista previa local: la subida real ocurre al enviar, pero sin esto el usuario
  // elige un archivo y no pasa nada visible hasta que responde el servidor.
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.12] bg-[rgba(246,242,235,0.08)]">
          {preview || avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview ?? avatarUrl!} alt="Tu foto de perfil" className="h-full w-full object-cover" />
          ) : (
            <User className="h-7 w-7 text-[#a98c88]" aria-hidden />
          )}
        </div>

        <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPreview(URL.createObjectURL(f));
              // Se envía solo: pedirle "elegir archivo" y después "guardar" son dos
              // clics para una decisión que ya tomó.
              formRef.current?.requestSubmit();
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="flex items-center gap-2 rounded-xl border border-white/[0.14] px-4 py-2.5 text-[13px] text-[#efe7e0] transition-colors hover:bg-white/[0.05] disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {avatarUrl ? "Cambiar foto" : "Subir foto"}
          </button>
        </form>

        {avatarUrl && (
          <form action={quitarAvatar}>
            <button
              type="submit"
              className="rounded-xl px-2 py-2.5 text-[13px] text-[#a98c88] transition-colors hover:text-[#f6f2eb]"
            >
              Quitar
            </button>
          </form>
        )}
      </div>
      <p className="text-[11px] text-[#8d7470]">PNG, JPG o WEBP. Hasta 2 MB.</p>
      <Estado state={state} />
    </div>
  );
}

export function KieKeyForm({ guardada }: { guardada: string | null }) {
  const [state, action, pending] = useActionState(guardarKieKey, INICIAL);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          name="key"
          placeholder={guardada ? `Guardada: ${guardada}` : "Pega aquí tu API key de KIE"}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          className={`${INPUT} min-w-[240px] flex-1`}
        />
        <Guardar pending={pending} />
      </div>
      <Estado state={state} />
    </form>
  );
}
