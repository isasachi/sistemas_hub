"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import ToolShell from "@/components/tools/ui/ToolShell";
import type { VideoSessionResponse } from "@/lib/video-ads/types";
import { SESSION_KEY } from "@/store/video";
import { seg } from "@/components/tools/generador-video-ads/sections/shared";

export default function VideoDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<VideoSessionResponse | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/generador-video-ads/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
      .catch(() => setS(null));
  }, [id]);

  function resume() {
    localStorage.setItem(SESSION_KEY, id);
    router.push("/tools/generador-video-ads/wizard");
  }

  return (
    <ToolShell name="Generador de Video Ads" slug="generador-video-ads" trail="Sesión">
      <div className="max-w-[900px] w-full mx-auto px-6 md:px-10 py-10">
        {s === undefined && <p className="text-[13px] text-[#a98c88]">Cargando…</p>}
        {s === null && <p className="text-[13px] text-[#a98c88]">No se encontró la sesión.</p>}
        {s && (
          <>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[22px] font-bold text-[#efe7e0]">{s.product_name || "Video sin nombre"}</h1>
                <p className="text-[12px] text-[#a98c88] mt-1">
                  {new Date(s.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })} · solo lectura
                </p>
              </div>
              <button onClick={resume} className="flex items-center gap-2 rounded-xl jr-cta px-4 py-2 text-[13px] font-bold flex-shrink-0">
                <RotateCw className="w-4 h-4" /> Reanudar sesión
              </button>
            </div>

            {/* Vista de solo lectura: el resumen del análisis forense, el guión final
                adaptado y los lotes ya renderizados, en ese orden — cada bloque solo
                aparece si existe. Reutiliza el estilo de tarjeta de las secciones del
                wizard (borde sutil + título en mayúsculas dorado) para que la sesión
                terminada se sienta parte de la misma tool, no una pantalla aparte. */}
            <div className="flex flex-col gap-4">
              {s.forensic_analysis?.resumenParaUsuario && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#2a0f1a] px-4 py-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
                    Análisis del video original
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-[#c9b4ae]">
                    {s.forensic_analysis.resumenParaUsuario}
                  </p>
                </div>
              )}

              {s.adapted?.guionFinal && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#2a0f1a] px-4 py-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
                    Guión final adaptado
                  </div>
                  <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#c9b4ae]">
                    {s.adapted.guionFinal}
                  </p>
                </div>
              )}

              {!!s.lotes?.length && (
                <div className="flex flex-col gap-3">
                  {s.lotes.map((l) => (
                    <div key={l.n} className="rounded-2xl border border-white/[0.06] bg-[#2a0f1a] p-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#c9a227]">
                        Lote {l.n} · {seg(l.duracionSeg)}
                      </div>
                      {l.videoUrl ? (
                        <video src={l.videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
                      ) : (
                        <p className="text-[12px] text-[#8b8b8b]">Todavía sin video.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!s.forensic_analysis?.resumenParaUsuario && !s.adapted?.guionFinal && !s.lotes?.length && (
                <p className="text-[13px] text-[#a98c88]">Esta sesión todavía no tiene resultados.</p>
              )}
            </div>
          </>
        )}
      </div>
    </ToolShell>
  );
}
