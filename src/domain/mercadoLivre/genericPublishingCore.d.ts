export type GenericPublishingError = {
  code: string;
  message: string;
  offerId?: string;
  axis?: string;
  attributeId?: string;
};

export type AttributeMapping = {
  targetId: string;
  source: "literal" | "supplierCode" | "variantAttribute" | "inferredMaterial";
  sourceKey?: string;
  valueName?: string;
  valueId?: string;
  values?: Record<string, string | { valueName?: string; valueId?: string }>;
};

export type PublishingProfile = {
  status: "reviewed" | "unreviewed" | "blocked";
  categoryId: string;
  domainId: string;
  familyName?: string;
  maxPictures?: number;
  variationAxes: string[];
  packQuantities: number[];
  attributeMappings: AttributeMapping[];
  currencyId?: string;
  buyingMode?: string;
  listingTypeId?: string;
};

export type NormalizedProduct = {
  id: string;
  title: string;
  description?: string;
  supplierCode?: string;
  sku?: string;
  stockQuantity?: number;
  images: string[];
  videoId?: string | null;
  offerPricesInCents: Record<string, number>;
  variants?: Array<{
    id: string;
    sku: string;
    sourceVideoId?: string | null;
    stockQuantity: number;
    images: string[];
    attributes: Record<string, string>;
    offerPricesInCents: Record<string, number>;
  }>;
};

export type PublishingPackage = {
  unitsPerPack: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightGrams: number;
  confidence: "confirmed" | "estimated";
  warning?: string | null;
};

export function inferMaterial(title: string, description?: string): string | null;
export function deriveProfilePacks(input: {
  desiredQuantities: number[];
  masterPack: {
    unitsPerPack: number;
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
  };
  unit?: {
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
  };
}): {
  packs: PublishingPackage[];
  errors: Array<GenericPublishingError & { unitsPerPack?: number }>;
  ready: boolean;
};
export function buildGenericUserProductPayloads(input: {
  product: NormalizedProduct;
  profile: PublishingProfile;
  categoryAttributes: Array<{ id: string; tags?: Record<string, boolean> }>;
  packages: PublishingPackage[];
}): {
  errors: GenericPublishingError[];
  publishable: boolean;
  payloads: Array<{
    offerId: string;
    variantId: string;
    unitsPerPack: number;
    sku: string;
    variationIdentity: string;
    package: PublishingPackage;
    errors: GenericPublishingError[];
    publishable: boolean;
    body: Record<string, unknown>;
  }>;
};
