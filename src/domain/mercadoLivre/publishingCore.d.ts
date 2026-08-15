export type PenPublishingSource = {
  supplierCode: string;
  images: string[];
  videoId?: string | null;
  packs: Array<{
    unitsPerPack: number;
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
    confidence: "confirmed" | "estimated";
    warning: string | null;
  }>;
  variants: Array<{
    id: string;
    scxSku: string;
    offerPricesInCents: Record<string, number>;
    costInCents: number;
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
export function classifyOfferFinancials(input: {
  priceInCents: number;
  saleFeeInCents: number;
  shippingCostInCents: number;
  productCostInCents: number;
  operationalCostInCents?: number;
  taxReservePercentage?: number;
  minProfitInCents?: number;
  minReturnPercentage?: number;
  maxProductCostInCents?: number;
  warningMarginPercentage?: number;
}): {
  saleFeeInCents: number;
  shippingCostInCents: number;
  netRevenueInCents: number;
  contributionInCents: number;
  contributionPercentage: number;
  operationalCostInCents: number;
  taxReserveInCents: number;
  estimatedProfitInCents: number;
  returnPercentage: number;
  blockReasons: string[];
  publishable: boolean;
  financialStatus: "healthy" | "warning" | "blocked";
};
export function derivePackOptions(input: {
  masterUnits: number;
  innerUnits: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightGrams: number;
}): PenPublishingSource["packs"];
export function buildPenDescription(unitsPerPack?: number): string;
export function buildPenUserProductPayloads(product: PenPublishingSource): {
  familyName: string;
  description: string;
  payloads: Array<{
    offerId: string;
    variantId: string;
    sku: string;
    sourceVideoId?: string | null;
    color: string;
    unitsPerPack: number;
    unitPriceInCents: number;
    productCostInCents: number;
    description: string;
    readinessErrors?: string[];
    publishable: boolean;
    financialStatus: "healthy" | "warning" | "blocked";
    fees?: {
      saleFeeInCents: number;
      shippingCostInCents: number;
      netRevenueInCents: number;
      contributionInCents: number;
      contributionPercentage: number;
      operationalCostInCents: number;
      taxReserveInCents: number;
      estimatedProfitInCents: number;
      returnPercentage: number;
      blockReasons: string[];
    };
    package: PenPublishingSource["packs"][number];
    body: Record<string, unknown>;
  }>;
};
export function validatePenSource(product: PenPublishingSource): string[];
