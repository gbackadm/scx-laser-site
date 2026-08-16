export function planMarketplaceStockSync(input) {
  const localUnits = Math.max(0, Math.floor(Number(input.localUnits) || 0));
  const unitsPerPack = Math.max(1, Math.floor(Number(input.unitsPerPack) || 1));
  const pauseThreshold = Math.max(0, Math.floor(Number(input.pauseThreshold) || 0));
  const availableKits = Math.floor(localUnits / unitsPerPack);
  const lowStock = availableKits <= pauseThreshold;
  const currentStatus = String(input.currentStatus ?? "unknown");
  const currentQuantity = Math.max(0, Math.floor(Number(input.currentQuantity) || 0));
  const body = {};

  if (["closed", "under_review"].includes(currentStatus)) {
    return { availableKits, lowStock, action: "none", body };
  }

  if (currentQuantity !== availableKits) body.available_quantity = availableKits;

  if (lowStock && currentStatus === "active") {
    body.status = "paused";
    return { availableKits, lowStock, action: "pause", body };
  }

  if (!lowStock && input.pausedByStock === true && currentStatus === "paused") {
    body.status = "active";
    return { availableKits, lowStock, action: "reactivate", body };
  }

  return {
    availableKits,
    lowStock,
    action: Object.keys(body).length ? "update" : "none",
    body,
  };
}
