export type MarketplaceStockPlan = {
  availableKits: number;
  lowStock: boolean;
  action: "pause" | "reactivate" | "update" | "none";
  body: { available_quantity?: number; status?: "active" | "paused" };
};

export function planMarketplaceStockSync(input: {
  localUnits: number;
  unitsPerPack: number;
  pauseThreshold: number;
  currentStatus: string;
  currentQuantity: number;
  pausedByStock: boolean;
}): MarketplaceStockPlan;
