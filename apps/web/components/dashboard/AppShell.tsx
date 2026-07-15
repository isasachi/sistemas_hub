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
      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium no-underline transition-all duration-200",
      active
        ? "bg-[rgba(255,156,77,0.10)] text-[#ff9c4d]"
        : "text-[#a8a094] hover:text-[#f3efe8] hover:bg-[rgba(255,240,220,0.04)]",
    ].join(" ");

  const sidebar = (
    <div className="flex flex-col h-full">
      <Link
        href="/dashboard"
        onClick={() => setOpen(false)}
        className="flex items-center no-underline px-5 h-[60px] flex-shrink-0 border-b border-[rgba(255,240,220,0.07)]"
      >
        <span className="font-display text-[16px] font-medium text-[#f3efe8]">
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

        <div className="h-px bg-[rgba(255,240,220,0.07)] my-2" />
        <span className="spec-label px-3 mb-1">
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
                <span className="text-[9px] font-bold text-[#726b60] bg-[rgba(255,240,220,0.05)] rounded-full px-1.5 py-0.5 tracking-[0.5px] uppercase">
                  Pronto
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Cuenta + logout */}
      <div className="border-t border-[rgba(255,240,220,0.07)] p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-[rgba(255,156,77,0.10)] flex items-center justify-center text-[12px] font-bold text-[#ff9c4d] flex-shrink-0">
            {user.label.charAt(0).toUpperCase()}
          </div>
          <span className="text-[12px] text-[#a8a094] truncate">{user.label}</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-[#a8a094] hover:text-[#f3efe8] hover:bg-[rgba(255,240,220,0.04)] transition-all duration-200 cursor-pointer border-0 bg-transparent"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#141210]">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-[248px] flex-shrink-0 flex-col border-r border-[rgba(255,240,220,0.07)] bg-[#181512] sticky top-0 h-screen">
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
            className="md:hidden fixed inset-y-0 left-0 w-[248px] z-50 flex flex-col border-r border-[rgba(255,240,220,0.07)] bg-[#181512]"
          >
            {sidebar}
          </aside>
        </>
      )}

      {/* Columna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between h-[56px] px-4 border-b border-[rgba(255,240,220,0.07)] bg-[#181512]/90 backdrop-blur-[16px] sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="text-[#a8a094] hover:text-[#f3efe8] cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-display text-[15px] font-medium text-[#f3efe8]">
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
          className="md:hidden fixed top-3 right-4 z-50 text-[#a8a094] hover:text-[#f3efe8] cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
