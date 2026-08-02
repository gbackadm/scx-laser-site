export type EntityId = string;

export type MoneyAmount = {
  currency: "BRL";
  amountInCents: number;
};

export type SupplierImportStatus =
  | "pending_review"
  | "mapped"
  | "ignored"
  | "sync_error";

export type CatalogPublicationStatus =
  | "published"
  | "hidden"
  | "draft"
  | "out_of_stock";

export type SyncStatus = "queued" | "running" | "completed" | "failed";

export type UserRole = "owner" | "manager" | "seller";

export type StockPolicy = "tracked" | "made_to_order" | "untracked";

export type Category = {
  id: EntityId;
  name: string;
  slug: string;
  parentId?: EntityId;
  sortOrder: number;
  isActive: boolean;
};

export type ProductImageReference = {
  id: EntityId;
  productId: EntityId;
  url: string;
  altText: string;
  source: "supplier" | "local" | "curated";
  sortOrder: number;
};

export type SupplierProduct = {
  id: EntityId;
  supplierId: EntityId;
  supplierName: string;
  externalId: string;
  rawName: string;
  rawDescription?: string;
  rawCategory?: string;
  rawImageUrls: string[];
  cost?: MoneyAmount;
  suggestedPrice?: MoneyAmount;
  stockAvailable?: number;
  lastImportedAt: string;
  importStatus: SupplierImportStatus;
  rawPayloadRef?: string;
};

export type CatalogProduct = {
  id: EntityId;
  sku: string;
  scxSku?: string;
  title: string;
  description?: string;
  categoryId: EntityId;
  supplierProductId?: EntityId;
  supplierName?: string;
  publicationStatus: CatalogPublicationStatus;
  price: MoneyAmount;
  cost?: MoneyAmount;
  stock: {
    policy: StockPolicy;
    quantity: number;
    lowStockThreshold?: number;
  };
  images: ProductImageReference[];
  tags: string[];
  updatedAt: string;
};

export type SyncRun = {
  id: EntityId;
  source: "supplier_import" | "manual_catalog_update";
  status: SyncStatus;
  startedAt: string;
  finishedAt?: string;
  importedCount: number;
  mappedCount: number;
  errorMessage?: string;
};

export type AdminUser = {
  id: EntityId;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export type AuditLogEntry = {
  id: EntityId;
  actorUserId?: EntityId;
  action:
    | "supplier_product_imported"
    | "catalog_product_created"
    | "catalog_product_updated"
    | "catalog_product_deleted"
    | "publication_status_changed"
    | "stock_adjusted"
    | "sync_run_completed"
    | "admin_user_created"
    | "admin_login_succeeded"
    | "admin_login_failed"
    | "admin_logout";
  entityType:
    | "supplier_product"
    | "catalog_product"
    | "category"
    | "sync_run"
    | "user";
  entityId: EntityId;
  occurredAt: string;
  summary: string;
};

export type CatalogListFilters = {
  search?: string;
  categoryId?: EntityId;
  publicationStatus?: CatalogPublicationStatus;
};
