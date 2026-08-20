"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import type { SessionResponse } from "@/lib/types";
import { SESSION_KEY } from "@/store/wizard";

export default function AnuncioDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<SessionResponse | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/generador-anuncios/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
      .catch(() => setS(null));
  }, [id]);

  function resume() {
    localStorage.setItem(SESSION_KEY, id);
    router.push("/tools/generador-anuncios/wizard");
  }

  return (
    <ToolShell name="Generador de Anuncios" slug="generador-anuncios" trail="Sesión">

      <div className="max-w-[900px] w-full mx-auto px-6 md:px-10 py-10">
        {s === undefined && <p className="text-[13px] text-[#a98c88]">Cargando…</p>}
        {s === null && <p className="text-[13px] text-[#a98c88]">No se encontró la sesión.</p>}
        {s && (
          <>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[22px] font-bold text-[#efe7e0]">{s.product_name || "Anuncio sin nombre"}</h1>
                <p className="text-[12px] text-[#a98c88] mt-1">
                  {new Date(s.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })} · solo lectura
                </p>
              </div>
              <button onClick={resume} className="flex items-center gap-2 rounded-xl jr-cta px-4 py-2 text-[13px] font-bold flex-shrink-0">
                <RotateCw className="w-4 h-4" /> Reanudar sesión
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                {s.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image_url} alt="Anuncio generado" className="w-full h-auto" />
                ) : (
                  <span className="text-[13px] text-[#a98c88] p-8">Sin imagen generada todavía</span>
                )}
              </div>

              <div className="flex flex-col gap-4">
                {s.confirmed_copy?.breakdown?.length ? (
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <p className="text-[11px] font-bold text-[#a98c88] tracking-[1px] uppercase mb-3">Copy confirmado</p>
                    <div className="flex flex-col gap-3">
                      {s.confirmed_copy.breakdown.map((c, i) => (
                        <div key={i}>
                          <p className="text-[11px] text-[#a98c88]">{c.element}</p>
                          <p className="text-[14px] text-[#efe7e0]">{c.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(s.target_audience || s.what_it_does) && (
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col gap-3">
                    {s.what_it_does && (
                      <div>
                        <p className="text-[11px] text-[#a98c88]">Qué hace</p>
                        <p className="text-[14px] text-[#efe7e0]">{s.what_it_does}</p>
                      </div>
                    )}
                    {s.target_audience && (
                      <div>
                        <p className="text-[11px] text-[#a98c88]">Público objetivo</p>
                        <p className="text-[14px] text-[#efe7e0]">{s.target_audience}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ToolShell>
  );
}
