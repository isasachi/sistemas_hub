"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import type { LandingSessionResponse } from "@/lib/landing/types";
import { SECTION_LABELS } from "@/lib/landing/types";
import { SESSION_KEY } from "@/store/landing";

export default function LandingDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<LandingSessionResponse | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/generador-landing/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
      .catch(() => setS(null));
  }, [id]);

  function resume() {
    localStorage.setItem(SESSION_KEY, id);
    router.push("/tools/generador-landing/wizard");
  }

  const sections = (s?.sections ?? []).slice().sort((a, b) => a.order - b.order);

  return (
    <ToolShell name="Generador de Landing" slug="generador-landing" trail="Sesión">

      <div className="max-w-[720px] w-full mx-auto px-6 md:px-10 py-10">
        {s === undefined && <p className="text-[13px] text-[#8a8a8a]">Cargando…</p>}
        {s === null && <p className="text-[13px] text-[#8a8a8a]">No se encontró la sesión.</p>}
        {s && (
          <>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[22px] font-bold text-[#f5f5f5]">{s.product_name || "Landing sin nombre"}</h1>
                <p className="text-[12px] text-[#8a8a8a] mt-1">
                  {new Date(s.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}
                  {s.price ? ` · ${s.price}` : ""} · solo lectura
                </p>
              </div>
              <button onClick={resume} className="flex items-center gap-2 rounded-xl jr-cta px-4 py-2 text-[13px] font-bold flex-shrink-0">
                <RotateCw className="w-4 h-4" /> Reanudar sesión
              </button>
            </div>

            {sections.length ? (
              <div className="flex flex-col gap-4">
                {sections.map((sec, i) => (
                  <div key={i} className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06]">
                    {sec.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sec.imageUrl} alt={SECTION_LABELS[sec.type]} className="w-full h-auto" />
                    ) : (
                      <div className="p-6 text-[13px] text-[#8a8a8a]">{SECTION_LABELS[sec.type]} — sin imagen aún</div>
                    )}
                    <p className="text-[11px] text-[#8a8a8a] px-3 py-2">{SECTION_LABELS[sec.type]}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#8a8a8a]">Esta sesión todavía no tiene secciones generadas.</p>
            )}
          </>
        )}
      </div>
    </ToolShell>
  );
}
