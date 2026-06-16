import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/dashboard/AppShell";

// Gate de autenticación del área privada (/dashboard y /tools/*). El middleware
// ya redirige a /login, pero esto es defensa en profundidad y nos da el user
// para el shell.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bypass temporal: AUTH_DISABLED=true entra como invitado, sin sesión.
  if (process.env.AUTH_DISABLED === "true") {
    return <AppShell user={{ label: "Invitado" }}>{children}</AppShell>;
  }

  const user = await getUser();
  if (!user) redirect("/login");

  const label = user.email ?? "Cuenta";

  return <AppShell user={{ label }}>{children}</AppShell>;
}
