"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/layout/Wordmark";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X, ChevronDown, Settings } from "lucide-react";
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

/**
 * Menú de cuenta. Es un COMPONENTE, no un elemento compartido: la barra lo
 * renderiza dos veces (desktop y móvil) y cada instancia necesita su propio
 * `ref`. Cuando era un solo elemento con un `ref` compartido, el ref apuntaba
 * al último nodo montado y el manejador de "click fuera" cerraba el menú en
 * `mousedown` al pulsar sobre el otro — desmontando el <form> antes de que el
 * click llegara a ser un submit. Cerrar sesión no hacía nada.
 */
function AccountMenu({ label }: { label: string }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [menu]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-label="Cuenta"
        aria-expanded={menu}
        className="flex items-center gap-1.5 rounded-full border border-white/[0.08] py-1 pl-1 pr-2 transition-colors duration-200 hover:border-white/[0.2] cursor-pointer"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(246,242,235,0.12)] font-[Archivo] text-[12px] font-bold text-[#e8dcd6]">
          {label.charAt(0).toUpperCase()}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-[#a98c88]" />
      </button>

      {menu && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[240px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101012] shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className="font-[Archivo] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c9b4ae]">
              Sesión
            </p>
            <p className="mt-0.5 truncate text-[13px] text-[#efe7e0]">{label}</p>
          </div>
          {/* Plan, créditos y la API key de KIE. Va en el menú de cuenta y no en
              la barra de tools: es configuración, no una herramienta. */}
          <Link
            href="/ajustes"
            onClick={() => setMenu(false)}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-[#a98c88] no-underline transition-colors duration-200 hover:bg-white/[0.05] hover:text-[#f6f2eb]"
          >
            <Settings className="h-[18px] w-[18px]" />
            Ajustes
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-3 text-[13px] font-medium text-[#a98c88] transition-colors duration-200 hover:bg-white/[0.05] hover:text-[#f6f2eb] cursor-pointer"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // drawer móvil

  // Esc cierra el drawer de tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toolLink = (href: string, active: boolean, soon: boolean) =>
    [
      "flex items-center gap-2 rounded-xl px-3.5 py-2 font-[Archivo] text-[14px] font-medium no-underline transition-all duration-200",
      // Dorado = dónde estás (igual que el riel del asistente). El naranja queda
      // libre para las acciones, que es lo que el usuario debe encontrar rápido.
      soon
        ? "text-[#967b76] cursor-default"
        : active
          ? "bg-[rgba(246,242,235,0.12)] text-[#e8dcd6]"
          : "text-[#a98c88] hover:text-[#f6f2eb] hover:bg-[rgba(255,255,255,0.05)]",
    ].join(" ");

  const logo = (
    <Link href="/dashboard" onClick={() => setOpen(false)} className="no-underline">
      <Wordmark size={18} />
    </Link>
  );

  const soonBadge = (
    <span className="rounded-full bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 font-[Archivo] text-[9px] font-semibold uppercase tracking-[0.08em] text-[#c9b4ae]">
      Pronto
    </span>
  );

  return (
    <div className="min-h-screen bg-[#14050a]">
      {/* Barra superior */}
      <header className="sticky top-0 z-40 border-b border-[rgba(255,255,255,0.06)] bg-[#14050a]/80 backdrop-blur-xl">
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
          <div className="ml-auto hidden items-center md:flex">
            <AccountMenu label={user.label} />
          </div>

          {/* Móvil: hamburguesa + cuenta */}
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <AccountMenu label={user.label} />
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
              className="text-[#a98c88] hover:text-[#f6f2eb] cursor-pointer"
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
                className="text-[#a98c88] hover:text-[#f6f2eb] cursor-pointer"
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
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 font-[Archivo] text-[13px] font-medium no-underline transition-all duration-200";
                if (soon) {
                  return (
                    <span key={tool.slug} className={`${cls} text-[#967b76]`}>
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
                        ? "bg-[rgba(246,242,235,0.12)] text-[#e8dcd6]"
                        : "text-[#a98c88] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#f6f2eb]"
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
