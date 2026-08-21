import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/roles";

/**
 * Panel de administración. Gate de ROL, y de nada más.
 *
 * ⚠️ VIVE FUERA DEL GRUPO `(app)`, igual que /cuenta y /suscripcion, y por una razón
 * más fuerte que en esos dos: el layout de `(app)` redirige a /suscripcion a quien no
 * tenga suscripción activa. Un admin sin plan —env de grandfathering vaciada, un
 * segundo admin que nunca compró, o el dueño con la tarjeta rechazada (`past_due`)—
 * quedaría encerrado justo fuera de la única pantalla capaz de arreglar entitlements.
 * El acceso de administración NO puede depender de tener un plan pagado.
 *
 * ⚠️ Y esto gatea la UI del panel; lo que protege las ESCRITURAS es `currentAdmin()`
 * dentro de cada server action. Un layout no cubre un action.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");

  // 404 y no un redirect: para quien no es admin el panel simplemente no existe.
  // Un "no tienes permiso" confirma que la ruta está ahí y a quién buscar.
  if (!(await isAdmin(user.id, user.email))) notFound();

  return (
    <div className="min-h-screen bg-[#14050a] px-6 py-12">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4">{children}</div>
    </div>
  );
}
