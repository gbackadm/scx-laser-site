import { demoCatalogProducts, demoCategories } from "@/domain/catalog/demoData";
import { toAdminProductList } from "@/domain/catalog/viewModels";
import type {
  AdminProduct,
  AdminProductStatus,
} from "@/domain/catalog/viewModels";

export type { AdminProduct, AdminProductStatus };

export const adminCatalogDemoProducts: AdminProduct[] = toAdminProductList(
  demoCatalogProducts,
  demoCategories,
);

export const adminCatalogCategories = Array.from(
  new Set(adminCatalogDemoProducts.map((product) => product.category)),
);
