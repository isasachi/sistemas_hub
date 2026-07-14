"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { tools } from "@/lib/tools";
import { toolIcon } from "@/lib/tool-icons";
import { signOut } from "@/app/actions/auth";

interface AppShellProps {
  user: { label: string };
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Esc cierra el drawer móvil.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const navItem = (href: string, active: boolean) =>
    [
      "flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13px] font-medium no-underline transition-colors duration-200",
      active
        ? "bg-[rgba(255,156,77,0.10)] text-[#ff9c4d]"
        : "text-[#a1a1a6] hover:text-[#f5f5f7] hover:bg-white/[0.05]",
    ].join(" ");

  const sidebar = (
    <div className="flex flex-col h-full">
      <Link
        href="/dashboard"
        onClick={() => setOpen(false)}
        className="flex items-center no-underline px-5 h-12 flex-shrink-0 border-b border-white/[0.08]"
      >
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#f5f5f7]">
          JR <span className="text-[#ff9c4d]">AI Hub</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-1 p-3 overflow-y-auto flex-1">
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className={navItem("/dashboard", pathname === "/dashboard")}
        >
          <LayoutDashboard className="w-[18px] h-[18px] flex-shrink-0" />
          Dashboard
        </Link>

        <div className="h-px bg-white/[0.08] my-2" />
        <span className="px-3 text-[10px] font-semibold text-[#6e6e73] tracking-[1.5px] uppercase mb-1">
          Herramientas
        </span>

        {tools.map((tool) => {
          const Icon = toolIcon(tool.icon);
          const href = `/tools/${tool.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={tool.slug}
              href={href}
              onClick={() => setOpen(false)}
              className={navItem(href, active)}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="flex-1 truncate">{tool.name}</span>
              {tool.status === "soon" && (
                <span className="text-[9px] font-semibold text-[#6e6e73] bg-white/[0.06] rounded-full px-1.5 py-0.5 tracking-[0.5px] uppercase">
                  Pronto
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Cuenta + logout */}
      <div className="border-t border-white/[0.08] p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-[12px] font-semibold text-[#ff9c4d] flex-shrink-0">
            {user.label.charAt(0).toUpperCase()}
          </div>
          <span className="text-[12px] text-[#a1a1a6] truncate">{user.label}</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[13px] font-medium text-[#a1a1a6] hover:text-[#f5f5f7] hover:bg-white/[0.05] transition-colors duration-200 cursor-pointer border-0 bg-transparent"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-black">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-[248px] flex-shrink-0 flex-col border-r border-white/[0.08] bg-[#101011] sticky top-0 h-screen">
        {sidebar}
      </aside>

      {/* Sidebar móvil (drawer) */}
      {open && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="md:hidden fixed inset-y-0 left-0 w-[248px] z-50 flex flex-col border-r border-white/[0.08] bg-[#101011]"
          >
            {sidebar}
          </aside>
        </>
      )}

      {/* Columna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between h-12 px-4 border-b border-white/[0.08] bg-[#161617]/80 backdrop-blur-xl backdrop-saturate-[180%] sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="text-[#a1a1a6] hover:text-[#f5f5f7] cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#f5f5f7]">
            JR <span className="text-[#ff9c4d]">AI Hub</span>
          </span>
          <span className="w-5" />
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Botón cerrar drawer (accesible) */}
      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
          className="md:hidden fixed top-3 right-4 z-50 text-[#a1a1a6] hover:text-[#f5f5f7] cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
