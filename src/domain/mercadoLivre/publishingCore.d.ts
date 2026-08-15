export type PenPublishingSource = {
  supplierCode: string;
  images: string[];
  variants: Array<{
    id: string;
    scxSku: string;
    priceInCents: number;
    stockQuantity: number;
    attributes: Record<string, string>;
    images: string[];
  }>;
};
export function publishingInputHash(value: unknown): string;
export function classifyMercadoLivreValidation(responseOk: boolean, body: unknown): {
  accepted: boolean;
  errors: unknown[];
  warnings: unknown[];
};
export function buildPenDescription(): string;
export function buildPenUserProductPayloads(product: PenPublishingSource): {
  familyName: string;
  description: string;
  payloads: Array<{ variantId: string; sku: string; color: string; body: Record<string, unknown> }>;
};
export function validatePenSource(product: PenPublishingSource): string[];
