import Link from "next/link";

import { logoutAdmin } from "@/app/admin/actions";
import { AdminNotice } from "@/components/admin/AdminNotice";
import { OlistSimulationPanel } from "@/components/admin/OlistSimulationPanel";
import { requireAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { getOlistSettings, listOlistRuns } from "@/domain/olist/repository";

export const metadata = {
  title: "Admin SCX Laser | Olist",
};

export const dynamic = "force-dynamic";

type AdminOlistPageProps = {
  searchParams?: Promise<{
    erro?: string;
    salvo?: string;
  }>;
};

function feedbackMessage(params: Awaited<AdminOlistPageProps["searchParams"]>) {
  if (params?.erro === "permissao") {
    return "Seu usuario nao tem permissao para alterar configuracoes Olist.";
  }

  if (params?.salvo) {
    return "Configuracao Olist salva.";
  }

  return null;
}

export default async function AdminOlistPage({
  searchParams,
}: AdminOlistPageProps) {
  const [session, params] = await Promise.all([
    requireAdminSession(),
    searchParams,
  ]);
  const canSimulateOlist = roleCan(session.role, "supplier:import");

  if (!canSimulateOlist) {
    return (
      <main className="min-h-screen bg-[#050606] px-5 py-8 text-white">
        <section className="mx-auto max-w-2xl rounded-md border border-white/10 bg-[#0d0f10] p-6">
          <h1 className="text-2xl font-black">Acesso negado</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Seu usuario nao tem permissao para simular envios ao Olist.
          </p>
        </section>
      </main>
    );
  }

  const [settings, runs] = await Promise.all([
    getOlistSettings(),
    listOlistRuns(10),
  ]);
  const message = feedbackMessage(params);

  return (
    <main className="min-h-screen bg-[#050606] text-white">
      <header className="border-b border-white/10 bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <Link href="/admin/catalogo" className="inline-flex items-center gap-3">
            <img
              src="/images/logo-scx-oficial.webp"
              alt="SCX Laser"
              width={96}
              height={64}
              className="h-12 w-[72px] object-contain object-left"
            />
            <span className="text-sm font-black uppercase tracking-[0.16em] text-zinc-200">
              Admin
            </span>
          </Link>
          <nav className="flex flex-wrap gap-2 text-sm md:justify-end">
            <span className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-400">
              {session.name} - {session.role}
            </span>
            <Link
              href="/admin/catalogo"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Catalogo
            </Link>
            <Link
              href="/admin/importacao"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Importacao
            </Link>
            <Link
              href="/admin/precos"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Precos
            </Link>
            <Link
              href="/"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Site publico
            </Link>
            <form action={logoutAdmin}>
              <button
                type="submit"
                className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
              >
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-8 sm:py-6 lg:px-12">
        <AdminNotice message={message} />
        <OlistSimulationPanel
          settings={settings}
          runs={runs}
          connection={{
            configured: Boolean(
              process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN,
            ),
            connected: Boolean(
              process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN,
            ),
          }}
        />
      </div>
    </main>
  );
}
