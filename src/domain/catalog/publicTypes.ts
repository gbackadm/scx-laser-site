export type PublicCatalogPriceTier = {
  label: string;
  unitPriceInCents: number;
  profile: "retail" | "corporate";
};

export type PublicCatalogProduct = {
  id: string;
  sku: string;
  supplierSku?: string;
  title: string;
  description?: string;
  category: string;
  imageUrls: string[];
  imageUrl?: string;
  priceInCents: number;
  tiers: PublicCatalogPriceTier[];
  variants: PublicCatalogVariant[];
};

export type PublicCatalogVariant = {
  id: string;
  sku: string;
  supplierSku: string;
  name: string;
  color?: string;
  imageUrls: string[];
  stockQuantity: number;
};
