import Link from "next/link";
import { PLANS, RAW_BUCKET_LABEL } from "@ph/shared";
import { getUser } from "@/lib/supabase/server";
import { getAccess } from "@/lib/whop";
import { creditStatus } from "@/lib/credits";
import { getKieKey, maskKey } from "@/lib/user-settings";
import KieKeyForm from "./KieKeyForm";

// Ajustes de la cuenta: qué plan tiene, cuántos créditos le quedan y su API key
// de KIE. Vive dentro del grupo `(app)`, así que el gate de suscripción ya corrió.
export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="jr-card rounded-2xl p-6">
      <h2 className="relative mb-4 text-[17px] text-[#f6f2eb]">{title}</h2>
      <div className="relative">{children}</div>
    </section>
  );
}

export default async function AjustesPage() {
  const user = await getUser();
  // Con AUTH_DISABLED el layout entra como invitado y acá no hay a quién mostrarle
  // nada; se sirve la pantalla vacía en vez de reventar.
  if (!user) {
    return (
      <main className="mx-auto w-full max-w-[760px] px-8 py-10">
        <p className="text-[13px] text-[#c9b4ae]">Inicia sesión para ver tus ajustes.</p>
      </main>
    );
  }

  const access = await getAccess(user.id, user.email);
  const credits = await creditStatus(user.id, access);
  const plan = PLANS[credits.tier];
  const key = maskKey(await getKieKey(user.id));
  const pct = Math.min(100, Math.round((credits.usados / Math.max(1, credits.limite)) * 100));

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-8 py-10">
      <header className="mb-2">
        <h1 className="lp-serif mb-1.5 text-[26px] leading-[1.15] text-[#f6f2eb]">Ajustes</h1>
        <p className="text-[14px] leading-[1.6] text-[#c9b4ae]">{user.email}</p>
      </header>

      <Card title="Tu plan">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[15px] font-extrabold text-[#efe7e0]">
            {plan.nombre}
            {access?.grandfathered && (
              <span className="ml-2 text-[12px] font-normal text-[#a98c88]">
                (acceso de por vida)
              </span>
            )}
          </p>
          {!access?.grandfathered && (
            <Link href="/suscripcion" className="text-[13px] font-bold text-[#e8467a] no-underline">
              Cambiar de plan
            </Link>
          )}
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-[#c9b4ae]">
          <li>Buscador: {plan.buckets.map((b) => RAW_BUCKET_LABEL[b]).join(" · ")}</li>
          <li>{plan.porRango} productos por rango</li>
          <li>{plan.creditos} imágenes por período</li>
        </ul>
      </Card>

      <Card title="Créditos de imagen">
        <p className="mb-2 text-[13px] text-[#c9b4ae]">
          <span className="text-[20px] font-extrabold text-[#efe7e0]">{credits.restantes}</span>
          {" "}de {credits.limite} disponibles · período desde el {credits.desde}
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
          role="progressbar"
          aria-valuenow={credits.usados}
          aria-valuemin={0}
          aria-valuemax={credits.limite}
        >
          <div className="h-full rounded-full bg-[#bd1347]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-[12px] text-[#a98c88]">
          Cada imagen de Anuncios, Branding o Landing consume 1 crédito. El generador de
          video y la calculadora de costos no gastan créditos.
        </p>
      </Card>

      <Card title="API key de KIE (generador de video)">
        <p className="mb-4 text-[13px] leading-[1.6] text-[#c9b4ae]">
          El render de video lo pagas con tu propia cuenta de KIE, por eso viene incluido
          en los tres planes. Pega acá tu key y el generador la usará para tus videos.
          Puedes crearla en{" "}
          <a
            href="https://kie.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#e8467a] no-underline"
          >
            kie.ai
          </a>
          .
        </p>
        <KieKeyForm guardada={key} />
      </Card>
    </main>
  );
}
