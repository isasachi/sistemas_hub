"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, RotateCw } from "lucide-react";
import type { BrandingSessionResponse } from "@/lib/branding/types";
import { SESSION_KEY } from "@/store/branding";

function Asset({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  return (
    <div className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-full h-auto object-contain" />
      <p className="text-[11px] text-[#8a8a8a] px-3 py-2">{label}</p>
    </div>
  );
}

export default function BrandingDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<BrandingSessionResponse | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/generador-branding/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
      .catch(() => setS(null));
  }, [id]);

  function resume() {
    localStorage.setItem(SESSION_KEY, id);
    router.push("/tools/generador-branding/wizard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <div className="px-8 py-3.5 border-b border-white/[0.06] flex items-center gap-2 text-[13px]">
        <Link href="/dashboard" className="text-[#8a8a8a] hover:text-[#bdbdbd] transition-colors no-underline">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5 text-[#8a8a8a]" />
        <Link href="/tools/generador-branding" className="text-[#8a8a8a] hover:text-[#bdbdbd] transition-colors no-underline">Generador de Branding</Link>
        <ChevronRight className="w-3.5 h-3.5 text-[#8a8a8a]" />
        <span className="text-[#f5f5f5] font-semibold">Sesión</span>
      </div>

      <div className="max-w-[900px] w-full mx-auto px-6 md:px-10 py-10">
        {s === undefined && <p className="text-[13px] text-[#8a8a8a]">Cargando…</p>}
        {s === null && <p className="text-[13px] text-[#8a8a8a]">No se encontró la sesión.</p>}
        {s && (
          <>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[22px] font-bold text-[#f5f5f5]">{s.brand_name || "Marca sin nombre"}</h1>
                <p className="text-[12px] text-[#8a8a8a] mt-1">
                  {new Date(s.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })} · solo lectura
                </p>
              </div>
              <button onClick={resume} className="flex items-center gap-2 rounded-xl bg-[#ff9c4d] px-4 py-2 text-[13px] font-bold text-[#0a0a0a] hover:bg-[#ffb066] transition-colors flex-shrink-0">
                <RotateCw className="w-4 h-4" /> Reanudar sesión
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <Asset url={s.mockup_url} label="Mockup" />
              <Asset url={s.logo_url} label="Logo" />
              <Asset url={s.label_url} label="Etiqueta" />
            </div>

            {s.direction?.palette?.length ? (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <p className="text-[11px] font-bold text-[#8a8a8a] tracking-[1px] uppercase mb-3">Paleta</p>
                <div className="flex flex-wrap gap-3">
                  {s.direction.palette.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-md border border-white/[0.1]" style={{ background: c.hex }} />
                      <div>
                        <p className="text-[12px] text-[#f5f5f5]">{c.name}</p>
                        <p className="text-[11px] text-[#8a8a8a]">{c.hex}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
