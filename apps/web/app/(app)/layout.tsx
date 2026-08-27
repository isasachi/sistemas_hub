import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getAccess } from "@/lib/whop";
import { getProfile } from "@/lib/user-settings";
import { isAdmin } from "@/lib/roles";
import { creditStatus } from "@/lib/credits";
import { AppShell } from "@/components/dashboard/AppShell";

// Gate de autenticación del área privada (/dashboard y /tools/*). El middleware
// ya redirige a /login, pero esto es defensa en profundidad y nos da el user
// para el shell.
//
// Y gate de SUSCRIPCIÓN: acá se lee `user_entitlements` (una query, sobre un
// round-trip que este layout ya hacía). Va acá y no en el middleware porque el
// middleware corre en cada request y hoy solo hace `getUser()`; sumarle una lectura
// de DB por request para gatear lo mismo sería pagar de más.
//
// ⚠️ Esto gatea la UI. Las rutas de `/api/*` NO pasan por acá ni por el middleware
// (ver el matcher de `proxy.ts`) — es un hueco previo a este cambio, no uno que el
// paywall introduzca: esas rutas hoy no piden sesión de ninguna clase. Ver la nota
// en AGENTS.md antes de asumir que el paywall las cubre.
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

  // `getAccess` en vez de `hasAccess`: el objeto que devuelve es el que necesita
  // `creditStatus` para saber el tier y el ancla del período, así que pedirlo acá
  // evita una segunda consulta de entitlement.
  const access = await getAccess(user.id, user.email);
  if (!access) redirect("/suscripcion");

  // El nombre, la foto y los créditos de la barra. Van DESPUÉS del gate (para no
  // pagarlos cuando el usuario ni siquiera va a ver el shell) y en paralelo entre
  // sí, así el shell no cuesta la suma de los dos round-trips.
  const [perfil, credits, admin] = await Promise.all([
    getProfile(user.id),
    creditStatus(user.id, access),
    isAdmin(user.id, user.email),
  ]);
  const label = perfil.fullName ?? user.email ?? "Cuenta";

  return (
    <AppShell
      user={{ label, avatarUrl: perfil.avatarUrl }}
      credits={{ restantes: credits.restantes, limite: credits.limite }}
      admin={admin}
    >
      {children}
    </AppShell>
  );
}
