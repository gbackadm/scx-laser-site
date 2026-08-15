export function orderListingPictureUrls(input: {
  variantImages?: string[];
  productImages?: string[];
  variantAttributes?: Record<string, string>;
  maxPictures?: number;
}): string[];
export function extractYoutubeVideoId(value: unknown): string | null;
export function buildMercadoLivreFamilyTitle(input: {
  title: string;
  unitsPerPack: number;
  description?: string;
  maxLength?: number;
}): string;
export function evaluateListingContent(input: {
  familyName?: string;
  pictures?: Array<{ source?: string }>;
  videoId?: string | null;
  description?: string;
  attributes?: Array<unknown>;
  mainPictureAccepted?: boolean | null;
}): {
  score: number;
  label: string;
  checks: Array<{ id: string; label: string; passed: boolean; blocking: boolean }>;
};
