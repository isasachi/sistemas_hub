"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, Eye, EyeOff } from "lucide-react";
import type { AuthState } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

interface AuthFormProps {
  mode: Mode;
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
}

const COPY = {
  login: {
    title: "Iniciá sesión",
    subtitle: "Accedé a tus herramientas de marketing con IA.",
    submit: "Entrar",
    google: "Continuar con Google",
    altText: "¿No tenés cuenta?",
    altLink: "/signup",
    altCta: "Creá una",
  },
  signup: {
    title: "Creá tu cuenta",
    subtitle: "Empezá a usar las herramientas en minutos.",
    submit: "Crear cuenta",
    google: "Registrate con Google",
    altText: "¿Ya tenés cuenta?",
    altLink: "/login",
    altCta: "Iniciá sesión",
  },
} as const;

function GoogleIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

export function AuthForm({ mode, action, next }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const [showPw, setShowPw] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const c = COPY[mode];

  async function signInWithGoogle() {
    setGoogleLoading(true);
    const supabase = createClient();
    const dest = next && next.startsWith("/") ? next : "/dashboard";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`,
      },
    });
    // Si signInWithOAuth no redirige (error), restauramos el botón.
    if (error) setGoogleLoading(false);
  }

  return (
    <div className="jr-card rounded-2xl p-7 w-full max-w-[400px]">
      <h1 className="text-[22px] font-bold gradient-text mb-1 font-[Poppins]">{c.title}</h1>
      <p className="text-[13px] text-[#bdbdbd] mb-6 leading-[1.5]">{c.subtitle}</p>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={googleLoading || pending}
        className="w-full flex items-center justify-center gap-2.5 bg-white/[0.04] border border-white/[0.12] hover:bg-white/[0.07] hover:border-white/[0.2] rounded-xl py-2.5 text-[14px] font-semibold text-[#f5f5f5] transition-all duration-200 cursor-pointer disabled:opacity-50"
      >
        {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
        {c.google}
      </button>

      {/* Divisor */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-white/[0.08]" />
        <span className="text-[11px] text-[#8a8a8a] uppercase tracking-[1px]">o con email</span>
        <div className="flex-1 h-px bg-white/[0.08]" />
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-[12px] font-semibold text-[#cfcfcf] mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@email.com"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-[14px] text-[#f5f5f5] placeholder:text-[#8a8a8a] outline-none focus:border-[rgba(255,156,77,0.5)] transition-colors"
          />
          {state.fieldErrors?.email && (
            <p className="text-[12px] text-[#fca5a5] mt-1.5">{state.fieldErrors.email}</p>
          )}
        </div>

        {/* Contraseña */}
        <div>
          <label htmlFor="password" className="block text-[12px] font-semibold text-[#cfcfcf] mb-1.5">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "signup" ? "Mínimo 8 caracteres" : "Tu contraseña"}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 pr-11 text-[14px] text-[#f5f5f5] placeholder:text-[#8a8a8a] outline-none focus:border-[rgba(255,156,77,0.5)] transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8a8a] hover:text-[#f5f5f5] transition-colors cursor-pointer"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {state.fieldErrors?.password && (
            <p className="text-[12px] text-[#fca5a5] mt-1.5">{state.fieldErrors.password}</p>
          )}
        </div>

        {/* Error / aviso global */}
        {state.error && (
          <div role="alert" className="bg-[rgba(233,61,61,0.08)] border border-[rgba(233,61,61,0.2)] rounded-xl px-3.5 py-2.5 text-[12px] text-[#fca5a5] leading-[1.5]">
            {state.error}
          </div>
        )}
        {state.notice && (
          <div role="status" className="bg-[rgba(255,156,77,0.08)] border border-[rgba(255,156,77,0.2)] rounded-xl px-3.5 py-2.5 text-[12px] text-[#ffb877] leading-[1.5]">
            {state.notice}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || googleLoading}
          className="jr-cta w-full rounded-xl py-3 text-[14px] font-bold disabled:opacity-50 cursor-pointer border-0 flex items-center justify-center gap-2 mt-1"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : c.submit}
        </button>
      </form>

      <p className="text-[13px] text-[#8a8a8a] text-center mt-5">
        {c.altText}{" "}
        <Link href={c.altLink} className="text-[#ff9c4d] font-semibold no-underline hover:underline">
          {c.altCta}
        </Link>
      </p>
    </div>
  );
}
