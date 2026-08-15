export function inferListingKitSize({ sku = "", title = "" }) {
  const match = `${sku} ${title}`.match(/(?:-K|KIT\s*)(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function inferListingGroupLabel({ familyName = "", title = "", id = "" }) {
  return String(familyName || title || id || "Anuncio sem titulo")
    .replace(/^kit\s+\d+\s+/i, "")
    .replace(/^\d+\s+(?=[a-z])/i, "")
    .trim();
}
