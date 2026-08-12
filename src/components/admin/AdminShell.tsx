"use client";

import {
  Boxes,
  DollarSign,
  ExternalLink,
  Gauge,
  LogOut,
  Menu,
  PackagePlus,
  Store,
  Truck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAdmin } from "@/app/admin/actions";
import { roleCan } from "@/domain/catalog/permissions";
import type { UserRole } from "@/domain/catalog/types";

type AdminShellProps = {
  session: {
    name: string;
    email: string;
    role: UserRole;
  };
  children: React.ReactNode;
};

const navigation = [
  { href: "/admin", label: "Visao geral", icon: Gauge, permission: "catalog:view" as const },
  { href: "/admin/catalogo", label: "Catalogo", icon: Boxes, permission: "catalog:view" as const },
  { href: "/admin/catalogo/novo", label: "Novo produto", icon: PackagePlus, permission: "catalog:edit" as const },
  { href: "/admin/importacao", label: "Asia Import", icon: Truck, permission: "supplier:import" as const },
  { href: "/admin/precos", label: "Precos", icon: DollarSign, permission: "catalog:view" as const },
  { href: "/admin/olist", label: "Olist", icon: Store, permission: "supplier:import" as const },
];

const roleLabels: Record<UserRole, string> = {
  owner: "Proprietario",
  manager: "Gerente",
  seller: "Vendedor",
};

export function AdminShell({ session, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNavigation = navigation.filter((item) =>
    roleCan(session.role, item.permission),
  );

  function isActive(href: string) {
    if (href === "/admin") return pathname === href;
    if (href === "/admin/catalogo") {
      return pathname === href || /^\/admin\/catalogo\/[^/]+\/editar$/.test(pathname);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-[#08090a]">
      <div className="flex h-[72px] items-center border-b border-white/10 px-5">
        <Link
          href="/admin"
          className="inline-flex items-center gap-3"
          onClick={() => setMobileOpen(false)}
        >
          <img
            src="/images/logo-scx-oficial.webp"
            alt="SCX Laser"
            width={80}
            height={54}
            className="h-11 w-16 object-contain object-left"
          />
          <div>
            <p className="text-sm font-black text-white">SCX Laser</p>
            <p className="text-xs font-bold text-zinc-500">Administracao</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Administracao">
        {visibleNavigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex min-h-11 items-center gap-3 rounded px-3 text-sm font-bold transition ${
                active
                  ? "bg-red-950/45 text-white shadow-[inset_3px_0_0_#e1121b]"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/"
          target="_blank"
          className="flex min-h-11 items-center gap-3 rounded px-3 text-sm font-bold text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
        >
          <ExternalLink size={18} aria-hidden="true" />
          Abrir site publico
        </Link>
        <div className="mt-2 border-t border-white/10 px-3 pt-4">
          <p className="truncate text-sm font-bold text-zinc-100">{session.name}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">{session.email}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-zinc-500">
              {roleLabels[session.role]}
            </span>
            <form action={logoutAdmin}>
              <button
                type="submit"
                title="Sair da administracao"
                aria-label="Sair da administracao"
                className="inline-flex h-9 w-9 items-center justify-center rounded border border-white/10 text-zinc-400 transition hover:border-red-400/40 hover:text-white"
              >
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050606] text-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/10 lg:block">
        {sidebar}
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#08090a]/95 px-4 backdrop-blur lg:hidden">
        <Link href="/admin" className="inline-flex items-center gap-3">
          <img
            src="/images/logo-scx-oficial.webp"
            alt="SCX Laser"
            width={68}
            height={46}
            className="h-10 w-14 object-contain object-left"
          />
          <span className="text-sm font-black">Administracao</span>
        </Link>
        <button
          type="button"
          title={mobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/12 text-zinc-200"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/75"
          />
          <aside className="absolute inset-y-0 left-0 w-[min(19rem,88vw)] border-r border-white/10">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="admin-content lg:pl-64">{children}</div>
    </div>
  );
}
