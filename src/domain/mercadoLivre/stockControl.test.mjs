import assert from "node:assert/strict";
import test from "node:test";

import { planMarketplaceStockSync } from "./stockControl.js";

test("calcula estoque em kits e pausa no limite", () => {
  assert.deepEqual(planMarketplaceStockSync({
    localUnits: 29, unitsPerPack: 10, pauseThreshold: 2,
    currentStatus: "active", currentQuantity: 5, pausedByStock: false,
  }), {
    availableKits: 2, lowStock: true, action: "pause",
    body: { available_quantity: 2, status: "paused" },
  });
});

test("nao reativa anuncio pausado manualmente", () => {
  assert.deepEqual(planMarketplaceStockSync({
    localUnits: 100, unitsPerPack: 10, pauseThreshold: 2,
    currentStatus: "paused", currentQuantity: 10, pausedByStock: false,
  }).action, "none");
});

test("reativa apenas anuncio pausado pela rotina quando estoque volta", () => {
  assert.deepEqual(planMarketplaceStockSync({
    localUnits: 100, unitsPerPack: 10, pauseThreshold: 2,
    currentStatus: "paused", currentQuantity: 1, pausedByStock: true,
  }), {
    availableKits: 10, lowStock: false, action: "reactivate",
    body: { available_quantity: 10, status: "active" },
  });
});
