"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Carga de la API key de KIE. La key NUNCA vuelve del servidor: `guardada` es
 * solo la cola enmascarada, para que se vea que hay una sin exponerla.
 */
export default function KieKeyForm({ guardada }: { guardada: string | null }) {
  const [key, setKey] = useState("");
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar(valor: string) {
    setEstado("guardando");
    setMensaje(null);
    try {
      const res = await fetch("/api/ajustes/kie-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: valor }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No pudimos guardar la key");
      setKey("");
      setEstado("ok");
      setMensaje(valor ? "Key guardada." : "Key eliminada.");
    } catch (e) {
      setEstado("error");
      setMensaje(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (key.trim()) guardar(key.trim()); }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={guardada ? `Guardada: ${guardada}` : "Pega aquí tu API key de KIE"}
          autoComplete="off"
          spellCheck={false}
          className="min-w-[240px] flex-1 rounded-xl border border-white/[0.12] bg-[#1e0811] px-3.5 py-2.5 text-[13px] text-[#efe7e0] placeholder:text-[#8d7470]"
        />
        <button
          type="submit"
          disabled={estado === "guardando" || !key.trim()}
          className="jr-cta flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] disabled:opacity-40"
        >
          {estado === "guardando" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar
        </button>
        {guardada && (
          <button
            type="button"
            onClick={() => guardar("")}
            disabled={estado === "guardando"}
            className="rounded-xl border border-white/[0.12] px-4 py-2.5 text-[13px] text-[#c9b4ae] transition-colors hover:bg-white/[0.04] disabled:opacity-40"
          >
            Eliminar
          </button>
        )}
      </div>

      {mensaje && (
        <p
          role="status"
          className={`text-[12px] ${estado === "error" ? "text-[#fca5a5]" : "text-emerald-300"}`}
        >
          {mensaje}
          {estado === "ok" && " Recarga la página para verlo reflejado."}
        </p>
      )}
    </form>
  );
}
