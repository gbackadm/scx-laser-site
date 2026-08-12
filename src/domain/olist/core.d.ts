export const OLIST_CHANNEL: "olist";
export const DEFAULT_BATCH_SIZE: 20;
export const DEFAULT_BATCH_CALLS_PER_MINUTE: 5;
export const DEFAULT_STOCK_MIN_QUANTITY: 1000;

export type OlistProductImage = {
  url: string;
  sort_order?: number;
};

export type OlistProductComponent = {
  component_sku: string;
  component_name: string;
  quantity: number | string;
  sort_order?: number;
};

export type OlistSyncProduct = {
  id: string;
  sku: string;
  scx_sku?: string | null;
  title: string;
  description?: string | null;
  publication_status: string;
  price_amount_in_cents: number;
  cost_amount_in_cents?: number | null;
  stock_quantity: number;
  category: string;
  supplier_name?: string | null;
  supplier_id?: string | null;
  external_id?: string | null;
  raw_payload?: Record<string, unknown> | null;
  olist_supplier_id?: string | null;
  olist_product_id?: string | null;
  images: OlistProductImage[];
  components?: OlistProductComponent[];
  production_steps?: string[];
};

export type OlistBlockedProduct = {
  product: OlistSyncProduct;
  reasons: string[];
};

export type OlistPlanSummary = {
  selectedProducts: number;
  eligibleProducts: number;
  blockedProducts: number;
  blockedByReason: Record<string, number>;
  stockMinQuantity: number;
  willBeActive: number;
  willBeInactive: number;
  creates: number;
  updates: number;
  estimatedApiCalls: number;
  eligibleProductsList: OlistSyncProduct[];
  blockedProductsList: OlistBlockedProduct[];
};

export function toMoney(cents: number | null | undefined): string;
export function normalizeDecimal(value: unknown): number | undefined;
export function formatDecimal(
  value: number | null | undefined,
  digits?: number,
): string | undefined;
export function truncate<T>(value: T, maxLength: number): T | string;
export function productShouldBeActive(
  product: OlistSyncProduct,
  stockMinQuantity: number,
): boolean;
export function validateOlistProduct(product: OlistSyncProduct): string[];
export function buildTinyProduct(
  product: OlistSyncProduct,
  origin: string | number,
  sequence: number,
  isUpdate: boolean,
  stockMinQuantity: number,
): {
  produto: Record<string, unknown>;
  scxSku: string;
  supplierSku: string;
  productId: string;
};
export function summarizeOlistPlan(
  products: OlistSyncProduct[],
  stockMinQuantity: number,
  batchSize?: number,
): OlistPlanSummary;
