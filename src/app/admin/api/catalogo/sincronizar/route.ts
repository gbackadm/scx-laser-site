import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { getCatalogAccess } from "@/domain/catalog/access";
import { getCatalogProductForAdmin } from "@/domain/catalog/adminRepository";
import { roleCan } from "@/domain/catalog/permissions";
import type { CatalogProduct } from "@/domain/catalog/types";
import { toAdminProductList } from "@/domain/catalog/viewModels";
import {
  calculateBatchTierPrices,
  getGlobalPricingRule,
  listGlobalPricingBatchTiers,
} from "@/domain/pricing/rules";
import {
  syncAllCatalogProductsFromAsiaImport,
  syncCatalogProductFromAsiaImport,
} from "@/domain/suppliers/asiaImportRepository";

async function toAdminProducts(products: CatalogProduct[]) {
  const catalogAccess = getCatalogAccess();
  const [categories, pricingRule, batchTiers] = await Promise.all([
    catalogAccess.listCategories(),
    getGlobalPricingRule(),
    listGlobalPricingBatchTiers(),
  ]);

  return toAdminProductList(products, categories).map((product) => {
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
  });
}

async function listAdminProducts() {
  const catalogAccess = getCatalogAccess();
  const products = await catalogAccess.listCatalogProducts();

  return toAdminProducts(products);
}

async function getAdminProduct(productId: string) {
  const product = await getCatalogProductForAdmin(productId);

  if (!product) {
    return null;
  }

  const [adminProduct] = await toAdminProducts([product]);

  return adminProduct ?? null;
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentAdminSession();
    const body = await request.json().catch(() => null);
    const productId = String(body?.productId ?? "");
    const syncAll = Boolean(body?.syncAll);

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message: "Sua sessao expirou. Entre no painel de novo para sincronizar.",
        },
        { status: 401 },
      );
    }

    if (!roleCan(session.role, "supplier:import")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Seu usuario nao tem permissao para sincronizar produtos.",
        },
        { status: 403 },
      );
    }

    if (syncAll) {
      const result = await syncAllCatalogProductsFromAsiaImport();
      const products = await listAdminProducts();

      await writeAdminAuditLog({
        actorUserId: session.id,
        action: "catalog_product_updated",
        entityType: "catalog_product",
        entityId: "catalog",
        summary: `Sincronizacao geral: ${result.syncedCount}/${result.totalCount} produto(s).`,
      });

      revalidatePath("/admin/catalogo");
      revalidatePath("/catalogo");

      return NextResponse.json({
        ok: true,
        message:
          result.errorCount > 0
            ? `Sincronizados ${result.syncedCount} de ${result.totalCount}. ${result.errorCount} falharam.`
            : `Sincronizados ${result.syncedCount} produto(s).`,
        products,
        ...result,
      });
    }

    if (!productId) {
      return NextResponse.json(
        { ok: false, message: "Produto nao encontrado." },
        { status: 400 },
      );
    }

    await syncCatalogProductFromAsiaImport(productId);
    const product = await getAdminProduct(productId);
    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "catalog_product_updated",
      entityType: "catalog_product",
      entityId: productId,
      summary: "Produto sincronizado manualmente com fornecedor.",
    });

    revalidatePath("/admin/catalogo");
    revalidatePath(`/admin/catalogo/${productId}/editar`);
    revalidatePath("/catalogo");

    return NextResponse.json({
      ok: true,
      message: "Produto sincronizado.",
      product,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel sincronizar agora.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
