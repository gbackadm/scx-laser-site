import { CatalogPanel } from "@/components/admin/CatalogPanel";
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
    criado?: string;
    olist_ok?: string;
    olist_pendente?: string;
    olist_erro?: string;
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

  if (params?.criado && params?.olist_ok) {
    return "Produto criado no catalogo e enviado ao Olist.";
  }

  if (params?.criado && params?.olist_erro) {
    return "Produto criado no catalogo, mas o envio ao Olist falhou. Revise em Olist.";
  }

  if (params?.criado && params?.olist_pendente) {
    return "Produto criado no catalogo. Olist ficou pendente pela configuracao ou validacao.";
  }

  if (params?.criado) {
    return "Produto criado no catalogo administrativo.";
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
  const message = catalogFeedbackMessage(resolvedSearchParams);

  return (
    <main className="min-w-0 min-h-screen bg-[#050606] text-white">
      <div className="mx-auto grid min-w-0 max-w-7xl gap-5 px-4 py-5 sm:px-8 sm:py-6 lg:px-12">
        {message ? (
          <div className="rounded border border-white/10 bg-[#0d0f10] px-4 py-3 text-sm font-bold text-zinc-100">
            {message}
          </div>
        ) : null}

        <CatalogPanel
          categories={adminCategories}
          products={adminProducts}
          canEdit={canEditCatalog}
          canPublish={canPublishCatalog}
          canSync={canSyncSupplier}
        />
      </div>
    </main>
  );
}
