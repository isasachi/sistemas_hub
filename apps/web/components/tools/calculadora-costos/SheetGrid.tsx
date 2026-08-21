"use client";

import { useState } from "react";

/**
 * Primitivas de "hoja de cálculo": la calculadora se ve y se recorre como el archivo
 * maestro (bloque con barra de título, filas de rótulo + casilla, todo a la vista de
 * una sola pantalla), pero pintado con la paleta del BRANDBOOK en vez de los rojos
 * de Excel — el granate/carmesí de la marca mapea 1:1 sobre el negro/rojo de la hoja.
 *
 * Un solo juego de piezas sirve a las tres hojas: `SheetBlock` para los bloques de
 * lista (rótulo → valor) y `SheetMatrix` para los que tienen varias columnas (las
 * ofertas por cantidad y los upsells).
 */

export type Fmt = "money" | "pct" | "int" | "dec" | "x";

/** Tono de la fila. `label` es el rótulo carmesí; el resto tiñe la CELDA de valor. */
export type Tone = "plain" | "strong" | "green" | "amber" | "muted";

export const fmt = (n: number, f: Fmt): string => {
  if (!Number.isFinite(n)) return "—";
  switch (f) {
    case "money":
      return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " PEN";
    case "pct":
      return (n * 100).toFixed(2) + "%";
    case "int":
      return Math.round(n).toLocaleString("es-PE");
    case "x":
      return n.toFixed(2);
    default:
      return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
};

const TONE_CELL: Record<Tone, string> = {
  plain: "bg-white/[0.02] text-[#efe7e0]",
  strong: "bg-white/[0.05] text-[#f6f2eb] font-semibold",
  green: "bg-[rgba(44,207,111,0.14)] text-[#3ed88a] font-semibold",
  amber: "bg-[rgba(246,173,85,0.14)] text-[#f6ad55] font-semibold",
  muted: "bg-transparent text-[#a98c88]",
};

/** Barra de título del bloque — el equivalente de la fila negra de la hoja. */
export function SheetTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0a0407] px-3 py-2 text-center font-sans text-[12px] font-bold uppercase tracking-[0.08em] text-[#f6f2eb]">
      {children}
    </div>
  );
}

/** Casilla numérica: se ve formateada como en la hoja y se edita en crudo al enfocarla. */
export function NumCell({
  value,
  format,
  onChange,
  tone = "plain",
  label,
  note,
}: {
  value: number;
  format: Fmt;
  /** Sin `onChange` la celda es de solo lectura (una fórmula de la hoja). */
  onChange?: (n: number) => void;
  tone?: Tone;
  /** Nombre accesible de la casilla: el rótulo es un `div`, no un `<label>`. */
  label?: string;
  /** Anotación al margen (las notas sueltas del maestro). Solo en celdas calculadas. */
  note?: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);

  if (!onChange) {
    return (
      // La nota va DENTRO de la celda, no posicionada fuera: el bloque es
      // `overflow-hidden` y cualquier cosa en `left-full` queda recortada.
      <div className={`readout flex items-baseline gap-2 px-2.5 py-[7px] text-[12px] tabular-nums ${TONE_CELL[tone]}`}>
        {note && <span className="shrink-0 text-[10px] font-normal text-[#a98c88]">{note}</span>}
        <span className="ml-auto text-right">{fmt(value, format)}</span>
      </div>
    );
  }

  // El % se escribe en unidades de pantalla (35, no 0.35), igual que en la hoja.
  const toRaw = (n: number) => (format === "pct" ? n * 100 : n);
  const fromRaw = (n: number) => (format === "pct" ? n / 100 : n);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={raw ?? fmt(value, format)}
      onFocus={(ev) => {
        setRaw(String(+toRaw(value).toFixed(6)));
        // Al entrar se selecciona todo, como en una hoja de cálculo: escribir REEMPLAZA.
        // No es cosmético — enfocar reescribe el valor ("40.00 PEN" → "40") y sin la
        // selección esa reescritura compite con la primera tecla y los dígitos se pegan
        // uno detrás de otro (medido: escribir "50" sobre "35" daba "3550").
        const el = ev.target;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(ev) => {
        setRaw(ev.target.value);
        const n = Number(ev.target.value.replace(",", "."));
        if (Number.isFinite(n)) onChange(fromRaw(n));
      }}
      onBlur={() => setRaw(null)}
      className="readout w-full border border-[rgba(232,70,122,0.28)] bg-[rgba(189,19,71,0.13)] px-2.5 py-[6px] text-right text-[12px] tabular-nums text-[#f6f2eb] outline-none transition-colors focus:border-[#e8467a] focus:bg-[rgba(189,19,71,0.22)]"
    />
  );
}

/** Rótulo carmesí de la izquierda. */
function LabelCell({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div
      className={`px-2.5 py-[7px] text-[12px] font-semibold leading-tight ${
        dim ? "bg-[rgba(189,19,71,0.35)] text-[#f0dfe4]" : "bg-[#BD1347] text-[#F6F2EB]"
      }`}
    >
      {children}
    </div>
  );
}

export type SheetRow =
  | {
      label: string;
      value: number;
      format: Fmt;
      /** Presente → la fila es una casilla editable; ausente → es una fórmula. */
      onChange?: (n: number) => void;
      tone?: Tone;
      /** Rótulo secundario a la derecha de la fila (las anotaciones sueltas del maestro). */
      note?: string;
      /** Rótulo apagado: filas derivadas que en la hoja no van en rojo pleno. */
      dim?: boolean;
    }
  | { spacer: true };

/** Bloque de lista: barra de título + filas rótulo | valor. */
export function SheetBlock({
  title,
  rows,
  className = "",
}: {
  title?: React.ReactNode;
  rows: SheetRow[];
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-md border border-white/[0.1] ${className}`}>
      {title && <SheetTitle>{title}</SheetTitle>}
      <div className="divide-y divide-white/[0.06]">
        {rows.map((r, i) =>
          "spacer" in r ? (
            <div key={i} className="h-3 bg-transparent" />
          ) : (
            <div key={r.label + i} className="grid grid-cols-[1.35fr_1fr] items-stretch gap-px bg-white/[0.06]">
              <LabelCell dim={r.dim}>{r.label}</LabelCell>
              <NumCell
                value={r.value}
                format={r.format}
                onChange={r.onChange}
                tone={r.tone}
                label={r.label}
                note={r.note}
              />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export interface MatrixRow {
  label: string;
  format: Fmt;
  /** Una entrada por columna. `onChange` ausente → celda calculada. */
  cells: { value: number; onChange?: (n: number) => void; tone?: Tone }[];
  /** Fila de total: ocupa el ancho de todas las columnas con un solo valor. */
  span?: { value: number; tone?: Tone };
}

/** Bloque de varias columnas: las ofertas por cantidad y los upsells. */
export function SheetMatrix({
  title,
  columns,
  rows,
  className = "",
}: {
  title: React.ReactNode;
  columns: string[];
  rows: MatrixRow[];
  className?: string;
}) {
  const grid = { gridTemplateColumns: `1.15fr repeat(${columns.length}, 1fr)` };
  return (
    <div className={`overflow-hidden rounded-md border border-white/[0.1] ${className}`}>
      <SheetTitle>{title}</SheetTitle>
      <div className="divide-y divide-white/[0.06]">
        <div className="grid items-stretch gap-px bg-white/[0.06]" style={grid}>
          <LabelCell>Big Offers</LabelCell>
          {columns.map((c) => (
            <div
              key={c}
              className="bg-white/[0.05] px-2.5 py-[7px] text-center text-[11px] font-semibold leading-tight text-[#f6f2eb]"
            >
              {c}
            </div>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.label} className="grid items-stretch gap-px bg-white/[0.06]" style={grid}>
            <LabelCell>{r.label}</LabelCell>
            {r.span ? (
              <div style={{ gridColumn: `span ${columns.length}` }}>
                <NumCell value={r.span.value} format={r.format} tone={r.span.tone ?? "strong"} />
              </div>
            ) : (
              r.cells.map((c, i) => (
                <NumCell
                  key={i}
                  value={c.value}
                  format={r.format}
                  onChange={c.onChange}
                  tone={c.tone}
                  label={`${r.label} · ${columns[i]}`}
                />
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
