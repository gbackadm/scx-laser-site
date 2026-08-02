import type { CatalogProduct, CatalogPublicationStatus, Category } from "./types";

export type AdminProductStatus =
  | "Publicado"
  | "Oculto"
  | "Rascunho"
  | "Sem estoque";

export type AdminProduct = {
  catalogId: string;
  sku: string;
  scxSku?: string;
  name: string;
  description: string;
  category: string;
  supplier: string;
  supplierProductId?: string;
  imageUrls: string[];
  primaryImageUrl?: string;
  costInCents?: number;
  priceInCents: number;
  batchPrices: AdminProductBatchPrice[];
  stock: number;
  publicationStatus: CatalogPublicationStatus;
  status: AdminProductStatus;
  updatedAt: string;
};

export type AdminProductBatchPrice = {
  minQuantity: number;
  unitPriceInCents: number;
  discountPercentage: number;
  minimumUnitPriceInCents: number;
};

export function toAdminProductList(
  products: CatalogProduct[],
  categories: Category[],
): AdminProduct[] {
  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  return products.map((product) => ({
    catalogId: product.id,
    sku: product.sku,
    scxSku: product.scxSku,
    name: product.title,
    description: product.description ?? "",
    category: categoryNameById.get(product.categoryId) ?? "Sem categoria",
    supplier: product.supplierName ?? "Manual",
    supplierProductId: product.supplierProductId,
    imageUrls: product.images.map((image) => image.url),
    primaryImageUrl: product.images[0]?.url,
    costInCents: product.cost?.amountInCents,
    priceInCents: product.price.amountInCents,
    batchPrices: [],
    stock: product.stock.quantity,
    publicationStatus: product.publicationStatus,
    status: publicationStatusLabel(product.publicationStatus),
    updatedAt: product.updatedAt,
  }));
}

export function publicationStatusLabel(
  status: CatalogPublicationStatus,
): AdminProductStatus {
  if (status === "published") {
    return "Publicado";
  }

  if (status === "hidden") {
    return "Oculto";
  }

  if (status === "out_of_stock") {
    return "Sem estoque";
  }

  return "Rascunho";
}
