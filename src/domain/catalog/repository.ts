import type {
  AdminUser,
  AuditLogEntry,
  CatalogListFilters,
  CatalogProduct,
  Category,
  EntityId,
  SupplierProduct,
  SyncRun,
} from "./types";

export type CatalogAccess = {
  listCatalogProducts(filters?: CatalogListFilters): Promise<CatalogProduct[]>;
  listSupplierProducts(): Promise<SupplierProduct[]>;
  listCategories(): Promise<Category[]>;
  listUsers(): Promise<AdminUser[]>;
  listAuditLog(entityId?: EntityId): Promise<AuditLogEntry[]>;
  listSyncRuns(): Promise<SyncRun[]>;
};

type DemoCatalogAccessData = {
  catalogProducts: CatalogProduct[];
  supplierProducts: SupplierProduct[];
  categories: Category[];
  users: AdminUser[];
  auditLog: AuditLogEntry[];
  syncRuns: SyncRun[];
};

export function createDemoCatalogAccess(data: DemoCatalogAccessData): CatalogAccess {
  return {
    async listCatalogProducts(filters = {}) {
      const search = filters.search?.trim().toLowerCase();

      return data.catalogProducts.filter((product) => {
        const hasStock = product.stock.quantity > 0;
        const hasImage = product.images.some((image) => image.url.trim().length > 0);
        const matchesSearch =
          !search ||
          product.title.toLowerCase().includes(search) ||
          product.sku.toLowerCase().includes(search) ||
          product.scxSku?.toLowerCase().includes(search);
        const matchesCategory =
          !filters.categoryId || product.categoryId === filters.categoryId;
        const matchesStatus =
          !filters.publicationStatus ||
          product.publicationStatus === filters.publicationStatus;

        return hasStock && hasImage && matchesSearch && matchesCategory && matchesStatus;
      });
    },
    async listSupplierProducts() {
      return data.supplierProducts.filter(
        (product) =>
          (product.stockAvailable ?? 0) > 0 &&
          product.rawImageUrls.some((url) => url.trim().length > 0),
      );
    },
    async listCategories() {
      return data.categories;
    },
    async listUsers() {
      return data.users;
    },
    async listAuditLog(entityId) {
      return entityId
        ? data.auditLog.filter((entry) => entry.entityId === entityId)
        : data.auditLog;
    },
    async listSyncRuns() {
      return data.syncRuns;
    },
  };
}
