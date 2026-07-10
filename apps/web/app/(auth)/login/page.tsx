import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "@/app/actions/auth";

const ERRORS: Record<string, string> = {
  restricted: "El acceso está limitado temporalmente. Pedí tus credenciales al administrador.",
  oauth: "No se pudo iniciar sesión con Google. Intentá de nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return <AuthForm mode="login" action={signIn} next={next} initialError={error ? ERRORS[error] : undefined} />;
}
