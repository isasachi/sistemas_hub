"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { TIERS, PLANS } from "@ph/shared";
import {
  cambiarRol, otorgarAcceso, revocarAcceso, ajustarCreditos,
  type FormState,
} from "./actions";

// Los tres formularios de la ficha en un archivo: comparten botón y mensaje de
// estado, y separarlos serían tres archivos de doce líneas.
//
// ⚠️ El `userId` viaja en un input oculto, y eso es correcto ACÁ: el objetivo de una
// acción de administración es otra persona por definición. Lo que no puede venir del
// cliente es el permiso, y eso lo resuelve `currentAdmin()` dentro de cada action.

const INICIAL: FormState = {};

const SELECT =
  "rounded-xl border border-white/[0.12] bg-[#1e0811] px-3.5 py-2.5 text-[13px] text-[#efe7e0]";

function Estado({ state }: { state: FormState }) {
  if (!state.error && !state.ok) return null;
  return (
    <p role="status" className={`text-[12px] ${state.error ? "text-[#fca5a5]" : "text-emerald-300"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

function Guardar({
  pending,
  children,
  tono = "cta",
}: {
  pending: boolean;
  children: string;
  tono?: "cta" | "sobrio";
}) {
  const clase =
    tono === "cta"
      ? "jr-cta"
      : "border border-white/[0.12] bg-white/[0.04] text-[#efe7e0] hover:border-[rgba(233,61,61,0.5)]";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] transition-colors disabled:opacity-40 ${clase}`}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function AccesoForm({ userId, tierActual }: { userId: string; tierActual: number | null }) {
  const [otorgado, otorgar, pOtorgar] = useActionState(otorgarAcceso, INICIAL);
  const [revocado, revocar, pRevocar] = useActionState(revocarAcceso, INICIAL);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <form action={otorgar} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="userId" value={userId} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[#a98c88]">Plan de cortesía</span>
            <select name="tier" defaultValue={String(tierActual ?? 3)} className={SELECT}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {PLANS[t].nombre} — {PLANS[t].porRango} productos/rango ·{" "}
                  {PLANS[t].creditos} créditos
                </option>
              ))}
            </select>
          </label>
          <Guardar pending={pOtorgar}>
            {tierActual ? "Cambiar cortesía" : "Otorgar acceso"}
          </Guardar>
        </form>

        {tierActual && (
          <form action={revocar}>
            <input type="hidden" name="userId" value={userId} />
            <Guardar pending={pRevocar} tono="sobrio">
              Quitar cortesía
            </Guardar>
          </form>
        )}
      </div>
      <Estado state={otorgado} />
      <Estado state={revocado} />
    </div>
  );
}

export function CreditosForm({
  userId,
  bonus,
  plan,
}: {
  userId: string;
  bonus: number;
  plan: number;
}) {
  const [state, action, pending] = useActionState(ajustarCreditos, INICIAL);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-[#a98c88]">Créditos extra</span>
          <input
            name="bonus"
            type="number"
            min={0}
            max={5000}
            step={1}
            defaultValue={bonus}
            className={`${SELECT} w-[120px]`}
          />
        </label>
        <Guardar pending={pending}>Guardar</Guardar>
      </div>
      <p className="text-[11px] text-[#8d7470]">
        Su plan trae {plan}. Con esto tendría {plan + bonus} por período. Pon 0 para quitar
        la cortesía.
      </p>
      <Estado state={state} />
    </form>
  );
}

export function RolForm({
  userId,
  role,
  esYoMismo,
}: {
  userId: string;
  role: string;
  esYoMismo: boolean;
}) {
  const [state, action, pending] = useActionState(cambiarRol, INICIAL);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-[#a98c88]">Rol</span>
          <select name="role" defaultValue={role} className={SELECT}>
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <Guardar pending={pending}>Guardar</Guardar>
      </div>
      {esYoMismo && (
        <p className="text-[11px] text-[#8d7470]">
          Eres tú: no puedes quitarte el rol de administrador y quedarte fuera del panel.
        </p>
      )}
      <Estado state={state} />
    </form>
  );
}
