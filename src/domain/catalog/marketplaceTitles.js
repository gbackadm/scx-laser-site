export const MARKETPLACE_TITLE_LIMITS = Object.freeze({
  mercado_livre: 60,
  shopee: 120,
  olist: 120,
  site: 120,
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeKnownIdentifiers(value, identifiers) {
  let normalized = value.replace(/\bSCX(?:-[A-Z0-9]+)+\b/gi, " ");

  for (const identifier of identifiers ?? []) {
    const cleanIdentifier = String(identifier ?? "").trim();
    if (!cleanIdentifier) continue;

    normalized = normalized.replace(
      new RegExp(`(^|\\s)${escapeRegExp(cleanIdentifier)}(?=\\s|$)`, "gi"),
      " ",
    );
  }

  return normalized;
}

function trimAtWord(value, maxLength) {
  if (value.length <= maxLength) return value;

  const candidate = value.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const trimmed = lastSpace >= Math.floor(maxLength * 0.6)
    ? candidate.slice(0, lastSpace)
    : candidate.slice(0, maxLength);

  return trimmed
    .replace(/[,:;./\-]+$/g, "")
    .replace(/\s+(?:de|da|do|das|dos|com|e|em|para)$/i, "")
    .trim();
}

export function normalizeCommercialTitle(value, identifiers = []) {
  return removeKnownIdentifiers(String(value ?? "").normalize("NFKC"), identifiers)
    .replace(/\bc\s*\/\s*/gi, "com ")
    .replace(/\bconj\.(?=\s|$)/gi, "Conjunto de")
    .replace(/\b(?:frete\s+gr[aá]tis|pronta\s+entrega|promo[cç][aã]o|oferta|estoque)\b/gi, " ")
    .replace(/\b(?:novo|usado|recondicionado)\b/gi, " ")
    .replace(/&/g, " e ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/["'`´“”‘’|•*]/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, "")
    .trim();
}

export function buildMarketplaceTitle(
  value,
  channel = "mercado_livre",
  options = {},
) {
  const defaultLimit = MARKETPLACE_TITLE_LIMITS[channel] ?? 60;
  const requestedLimit = Number(options.maxLength ?? defaultLimit);
  const maxLength = Number.isFinite(requestedLimit)
    ? Math.max(10, Math.floor(requestedLimit))
    : defaultLimit;
  const normalized = normalizeCommercialTitle(value, options.identifiers);

  return trimAtWord(normalized, maxLength);
}
