export type MarketplaceTitleChannel =
  | "mercado_livre"
  | "shopee"
  | "olist"
  | "site";

export const MARKETPLACE_TITLE_LIMITS: Readonly<
  Record<MarketplaceTitleChannel, number>
>;

export function normalizeCommercialTitle(
  value: unknown,
  identifiers?: unknown[],
): string;

export function buildMarketplaceTitle(
  value: unknown,
  channel?: MarketplaceTitleChannel,
  options?: { maxLength?: number; identifiers?: unknown[] },
): string;
