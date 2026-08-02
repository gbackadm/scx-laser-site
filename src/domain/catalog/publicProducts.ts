import "server-only";

import type { Category, CatalogProduct } from "@/domain/catalog/types";
import type {
  PublicCatalogPriceTier,
  PublicCatalogProduct,
} from "@/domain/catalog/publicTypes";
import {
  calculateBatchTierPrices,
  type PricingBatchTier,
  type PricingRule,
} from "@/domain/pricing/rules";

function tierRangeLabel(
  minQuantity: number,
  nextMinQuantity: number | undefined,
  index: number,
) {
  if (index === 0 && minQuantity <= 1) {
    return "1 un.";
  }

  if (!nextMinQuantity) {
    return `${minQuantity}+ un.`;
  }

  return `${minQuantity}-${nextMinQuantity - 1} un.`;
}

export function toPublicCatalogProducts(
  products: CatalogProduct[],
  categories: Category[],
  pricingRule: PricingRule,
  batchTiers: PricingBatchTier[],
): PublicCatalogProduct[] {
  const categoryById = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  return products.map((product) => {
    const baseAmountInCents =
      product.cost?.amountInCents ?? product.price.amountInCents;
    const tierPrices: PublicCatalogPriceTier[] = calculateBatchTierPrices(
      baseAmountInCents,
      pricingRule,
      batchTiers,
    ).map(({ tier, simulation }, index) => ({
      label: tierRangeLabel(
        tier.minQuantity,
        batchTiers[index + 1]?.minQuantity,
        index,
      ),
      unitPriceInCents: simulation.unitPriceAmountInCents,
      profile: tier.minQuantity < 50 ? "retail" : "corporate",
    }));

    return {
      id: product.id,
      sku: product.scxSku ?? product.sku,
      supplierSku: product.sku,
      title: product.title,
      description: product.description,
      category: categoryById.get(product.categoryId) ?? "Catalogo",
      imageUrls: product.images.map((image) => image.url),
      imageUrl: product.images[0]?.url,
      priceInCents: tierPrices[0]?.unitPriceInCents ?? product.price.amountInCents,
      tiers: tierPrices,
    };
  });
}
