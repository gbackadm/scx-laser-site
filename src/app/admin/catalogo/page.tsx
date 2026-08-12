import Link from "next/link";

import { AdminNotice } from "@/components/admin/AdminNotice";
import { CatalogPanel } from "@/components/admin/CatalogPanel";
import { logoutAdmin } from "@/app/admin/actions";
import { requireAdminSession } from "@/domain/auth/session";
import { getCatalogAccess } from "@/domain/catalog/access";
import { roleCan } from "@/domain/catalog/permissions";
import { toAdminProductList } from "@/domain/catalog/viewModels";
import {
  calculateBatchTierPrices,
  getGlobalPricingRule,
  listGlobalPricingBatchTiers,
} from "@/domain/pricing/rules";

export const metadata = {
  title: "Admin SCX Laser | Catalogo",
};

export const dynamic = "force-dynamic";

type AdminCatalogPageProps = {
  searchParams?: Promise<{
    erro?: string;
    excluido?: string;
    status?: string;
  }>;
};

function catalogFeedbackMessage(
  params: Awaited<AdminCatalogPageProps["searchParams"]>,
) {
  if (params?.erro === "permissao") {
    return "Seu usuario nao tem permissao para excluir produtos.";
  }

  if (params?.erro === "produto") {
    return "Produto nao encontrado para exclusao.";
  }

  if (params?.erro === "status") {
    return "Use um status valido para alterar o produto.";
  }

  if (params?.erro === "validacao") {
    return "Revise titulo, categoria e preco antes de publicar.";
  }

  if (params?.status) {
    return "Status do produto atualizado.";
  }

  if (params?.excluido) {
    return "Produto excluido do catalogo administrativo.";
  }

  return null;
}

export default async function AdminCatalogPage({
  searchParams,
}: AdminCatalogPageProps) {
  const session = await requireAdminSession();
  const resolvedSearchParams = await searchParams;
  const canViewCatalog = roleCan(session.role, "catalog:view");
  const canEditCatalog = roleCan(session.role, "catalog:edit");
  const canPublishCatalog = roleCan(session.role, "catalog:publish");
  const canSyncSupplier = roleCan(session.role, "supplier:import");

  if (!canViewCatalog) {
    return (
      <main className="min-h-screen bg-[#050606] px-5 py-8 text-white">
        <section className="mx-auto max-w-2xl rounded-md border border-white/10 bg-[#0d0f10] p-6">
          <h1 className="text-2xl font-black">Acesso negado</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Seu usuario nao tem permissao para visualizar o catalogo.
          </p>
        </section>
      </main>
    );
  }

  const catalogAccess = getCatalogAccess();
  const [catalogProducts, categories, pricingRule, batchTiers] = await Promise.all([
    catalogAccess.listCatalogProducts(),
    catalogAccess.listCategories(),
    getGlobalPricingRule(),
    listGlobalPricingBatchTiers(),
  ]);
  const adminProducts = toAdminProductList(catalogProducts, categories).map(
    (product) => {
      const baseAmountInCents = product.costInCents ?? product.priceInCents;

      return {
        ...product,
        batchPrices: calculateBatchTierPrices(
          baseAmountInCents,
          pricingRule,
          batchTiers,
        ).map(({ tier, simulation }) => ({
          minQuantity: tier.minQuantity,
          unitPriceInCents: simulation.unitPriceAmountInCents,
          discountPercentage: tier.discountPercentage,
          minimumUnitPriceInCents: tier.minimumUnitPriceAmountInCents,
        })),
      };
    },
  );
  const adminCategories = Array.from(
    new Set(adminProducts.map((product) => product.category)),
  );
  const sourceLabel = process.env.DATABASE_URL
    ? "PostgreSQL"
    : "Dados demonstrativos locais";
  const message = catalogFeedbackMessage(resolvedSearchParams);

  return (
    <main className="min-h-screen bg-[#050606] text-white">
      <header className="border-b border-white/10 bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <Link href="/admin/login" className="inline-flex items-center gap-3">
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
              href="/admin/olist"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Olist
            </Link>
            <Link
              href="/"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Site publico
            </Link>
            <Link
              href="/admin/login"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Login
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

        {message ? (
          <div className="rounded border border-white/10 bg-[#0d0f10] px-4 py-3 text-sm font-bold text-zinc-100">
            {message}
          </div>
        ) : null}

        <CatalogPanel
          categories={adminCategories}
          products={adminProducts}
          sourceLabel={sourceLabel}
          canEdit={canEditCatalog}
          canPublish={canPublishCatalog}
          canSync={canSyncSupplier}
        />
      </div>
    </main>
  );
}
