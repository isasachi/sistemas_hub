"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X, ChevronDown } from "lucide-react";
import { tools } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";
import { signOut } from "@/app/actions/auth";

interface AppShellProps {
  user: { label: string };
  children: React.ReactNode;
}

// Etiquetas cortas para la barra superior (los nombres completos no caben en fila).
const NAV_LABEL: Record<string, string> = {
  "buscador-productos": "Productos",
  "generador-anuncios": "Anuncios",
  "generador-video-ads": "Video Ads",
  "generador-branding": "Branding",
  "calculadora-costos": "Costos",
  "generador-landing": "Landing",
};

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // drawer móvil
  const [menu, setMenu] = useState(false); // dropdown de cuenta
  const menuRef = useRef<HTMLDivElement>(null);

  // Esc cierra drawer y menú de cuenta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMenu(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click fuera cierra el dropdown de cuenta.
  useEffect(() => {
    if (!menu) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menu]);

  const toolLink = (href: string, active: boolean, soon: boolean) =>
    [
      "flex items-center gap-2 rounded-xl px-3.5 py-2 font-[Poppins] text-[14px] font-medium no-underline transition-all duration-200",
      // Dorado = dónde estás (igual que el riel del asistente). El naranja queda
      // libre para las acciones, que es lo que el usuario debe encontrar rápido.
      soon
        ? "text-[#6a6a6a] cursor-default"
        : active
          ? "bg-[rgba(214,168,96,0.12)] text-[#d6a860]"
          : "text-[#bebebe] hover:text-[#ffffff] hover:bg-[rgba(255,255,255,0.05)]",
    ].join(" ");

  const logo = (
    <Link href="/dashboard" onClick={() => setOpen(false)} className="no-underline">
      {/* Poppins directo: la barra vive fuera de .lp-root, donde .lp-serif no aplica. */}
      <span className="font-[Poppins] text-[19px] font-semibold tracking-[0.12em] text-[#ededed]">
        JR <span className="text-[#d6a860]">AI HUB</span>
      </span>
    </Link>
  );

  const soonBadge = (
    <span className="rounded-full bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 font-[Poppins] text-[9px] font-semibold uppercase tracking-[0.08em] text-[#cfcfcf]">
      Pronto
    </span>
  );

  const account = (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-label="Cuenta"
        aria-expanded={menu}
        className="flex items-center gap-1.5 rounded-full border border-white/[0.08] py-1 pl-1 pr-2 transition-colors duration-200 hover:border-white/[0.2] cursor-pointer"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(214,168,96,0.12)] font-[Poppins] text-[12px] font-bold text-[#d6a860]">
          {user.label.charAt(0).toUpperCase()}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-[#bebebe]" />
      </button>

      {menu && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[240px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101012] shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className="font-[Poppins] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#cfcfcf]">
              Sesión
            </p>
            <p className="mt-0.5 truncate text-[13px] text-[#ededed]">{user.label}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-3 text-[13px] font-medium text-[#bebebe] transition-colors duration-200 hover:bg-white/[0.05] hover:text-[#ffffff] cursor-pointer"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0b0c]">
      {/* Barra superior */}
      <header className="sticky top-0 z-40 border-b border-[rgba(255,255,255,0.06)] bg-[#0b0b0c]/80 backdrop-blur-xl">
        <div className="flex h-[64px] items-center gap-4 px-4 md:px-8">
          {logo}

          {/* Tools de izquierda a derecha (desktop) */}
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {tools.map((tool) => {
              const Icon = toolIcon(tool.icon);
              const href = `/tools/${tool.slug}`;
              const soon = tool.status === "soon";
              const active = pathname.startsWith(href);
              const label = NAV_LABEL[tool.slug] ?? tool.name;
              if (soon) {
                return (
                  <span key={tool.slug} className={toolLink(href, false, true)}>
                    <Icon className="h-[17px] w-[17px] flex-shrink-0" />
                    {label}
                    {soonBadge}
                  </span>
                );
              }
              return (
                <Link key={tool.slug} href={href} className={toolLink(href, active, false)}>
                  <Icon className="h-[17px] w-[17px] flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Espaciador + cuenta a la derecha (desktop) */}
          <div className="ml-auto hidden items-center md:flex">{account}</div>

          {/* Móvil: hamburguesa + cuenta */}
          <div className="ml-auto flex items-center gap-2 md:hidden">
            {account}
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
              className="text-[#bebebe] hover:text-[#ffffff] cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Drawer de tools (móvil) */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menú de herramientas"
            className="fixed inset-y-0 right-0 z-50 flex w-[264px] flex-col border-l border-[rgba(255,255,255,0.06)] bg-[#0c0c0d] md:hidden"
          >
            <div className="flex h-[64px] flex-shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-5">
              {logo}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="text-[#bebebe] hover:text-[#ffffff] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {tools.map((tool) => {
                const Icon = toolIcon(tool.icon);
                const href = `/tools/${tool.slug}`;
                const soon = tool.status === "soon";
                const active = pathname.startsWith(href);
                const label = NAV_LABEL[tool.slug] ?? tool.name;
                const cls =
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 font-[Poppins] text-[13px] font-medium no-underline transition-all duration-200";
                if (soon) {
                  return (
                    <span key={tool.slug} className={`${cls} text-[#6a6a6a]`}>
                      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                      <span className="flex-1">{label}</span>
                      {soonBadge}
                    </span>
                  );
                }
                return (
                  <Link
                    key={tool.slug}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`${cls} ${
                      active
                        ? "bg-[rgba(214,168,96,0.12)] text-[#d6a860]"
                        : "text-[#bebebe] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#ffffff]"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </>
      )}

      {/* Contenido a ancho completo */}
      <main className="min-h-[calc(100vh-64px)]">{children}</main>
    </div>
  );
}
