import Link from "next/link";

import { logoutAdmin } from "@/app/admin/actions";
import { AdminNotice } from "@/components/admin/AdminNotice";
import { ImportProductsTable } from "@/components/admin/ImportProductsTable";
import { requireAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { getAsiaImportConfigStatus } from "@/domain/suppliers/asiaImport";
import { listAsiaSupplierProductsForReview } from "@/domain/suppliers/asiaImportRepository";

import { clearPendingAsiaImport, runAsiaImport } from "./actions";

export const metadata = {
  title: "Admin SCX Laser | Importacao Asia",
};

export const dynamic = "force-dynamic";

type ImportPageProps = {
  searchParams?: Promise<{
    erro?: string;
    sucesso?: string;
    rascunho?: string;
    limpo?: string;
    qtd?: string;
  }>;
};

export default async function AdminImportPage({ searchParams }: ImportPageProps) {
  const [session, params] = await Promise.all([
    requireAdminSession(),
    searchParams,
  ]);
  const canImport = roleCan(session.role, "supplier:import");
  const canEditCatalog = roleCan(session.role, "catalog:edit");
  const config = getAsiaImportConfigStatus();
  const listLimit = Math.min(Number(params?.qtd ?? 50), 100);
  const supplierProducts = await listAsiaSupplierProductsForReview(
    Number.isFinite(listLimit) ? listLimit : 50,
  );

  const message =
    params?.erro === "credenciais"
      ? "Configure ASIA_IMPORT_API_KEY e ASIA_IMPORT_SECRET_KEY no ambiente do deploy. Em desenvolvimento local, use .env.local."
      : params?.erro === "permissao"
        ? "Seu usuario nao tem permissao para executar esta acao."
        : params?.erro === "sincronizacao"
          ? "A sincronizacao falhou. Consulte o historico no banco para detalhes."
          : params?.sucesso
            ? `Importacao concluida: ${params.sucesso} produto(s) trazido(s) para revisao.`
            : params?.rascunho
              ? "Rascunho criado no catalogo. Ele permanece nao publicado."
              : params?.limpo
                ? `Importacao pendente limpa: ${params.limpo} produto(s) removido(s).`
                : null;

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
        <AdminNotice />

        <section className="rounded-md border border-white/10 bg-[#0d0f10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
            Asia Import
          </p>
          <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
            Importacao manual de produtos
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            Busque produtos reais do fornecedor, escolhendo a quantidade alvo.
            O sistema pagina a API automaticamente e mantem tudo fora do
            catalogo publico ate revisao manual.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                Endpoint
              </p>
              <p className="mt-2 break-all text-sm text-zinc-200">
                {config.baseUrl}
              </p>
            </div>
            <div className="rounded border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                Chave API
              </p>
              <p
                className={`mt-2 text-sm font-bold ${
                  config.hasApiKey ? "text-emerald-200" : "text-amber-200"
                }`}
              >
                {config.hasApiKey ? "Configurada" : "Pendente"}
              </p>
            </div>
            <div className="rounded border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                Senha API
              </p>
              <p
                className={`mt-2 text-sm font-bold ${
                  config.hasSecretKey ? "text-emerald-200" : "text-amber-200"
                }`}
              >
                {config.hasSecretKey ? "Configurada" : "Pendente"}
              </p>
            </div>
          </div>

          {message ? (
            <div className="mt-5 rounded border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-zinc-100">
              {message}
            </div>
          ) : null}

          <form action={runAsiaImport} className="mt-6 grid gap-4 lg:grid-cols-5">
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Pagina
              <input
                name="pagina"
                type="number"
                min={1}
                defaultValue={1}
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Quantidade
              <select
                name="quantidade"
                defaultValue={String(listLimit)}
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
              >
                <option value="10">10 produtos</option>
                <option value="20">20 produtos</option>
                <option value="50">50 produtos</option>
                <option value="100">100 produtos</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Nome
              <input
                name="nome"
                placeholder="Opcional"
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Referencia
              <input
                name="referencia"
                placeholder="Opcional"
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Status
              <select
                name="status"
                defaultValue="all"
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
              >
                <option value="all">Todos</option>
                <option value="true">Publicados na Asia</option>
                <option value="false">Nao publicados na Asia</option>
              </select>
            </label>
            <div className="lg:col-span-5">
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={!canImport}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-5 text-sm font-black uppercase text-white shadow-[0_0_24px_rgba(225,18,27,0.18)] transition hover:bg-red-600 disabled:border-white/12 disabled:bg-white/[0.03] disabled:text-zinc-500 sm:w-auto"
                >
                  Sincronizar produtos
                </button>
                <button
                  formAction={clearPendingAsiaImport}
                  disabled={!canImport}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded border border-white/12 px-5 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white disabled:text-zinc-600 sm:w-auto"
                >
                  Limpar pendentes
                </button>
              </div>
            </div>
          </form>
        </section>

        <ImportProductsTable
          canEditCatalog={canEditCatalog}
          products={supplierProducts}
        />
      </div>
    </main>
  );
}
