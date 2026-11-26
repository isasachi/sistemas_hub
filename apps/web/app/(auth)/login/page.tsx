import { AuthForm } from "@/components/auth/AuthForm";
import { signIn, sendLoginLink } from "@/app/actions/auth";

const ERRORS: Record<string, string> = {
  restricted: "El acceso está limitado temporalmente. Pide tus credenciales al administrador.",
  // /auth/callback: login de Google. Los enlaces del correo van a /auth/confirm (la
  // plantilla de Supabase apunta ahí) y fallan con `enlace`.
  oauth: "No se pudo iniciar sesión con Google. Intenta de nuevo.",
  enlace: "El enlace del correo ya venció o ya se usó. Pide uno nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      action={signIn}
      linkAction={sendLoginLink}
      next={next}
      initialError={error ? ERRORS[error] : undefined}
    />
  );
}
