import test from "node:test";
import assert from "node:assert/strict";

import { inferListingGroupLabel, inferListingKitSize } from "./listingPresentation.js";

test("identifica kits pelo SKU ou pelo titulo", () => {
  assert.equal(inferListingKitSize({ sku: "SCX-CAN-0021-K200", title: "Caneta" }), 200);
  assert.equal(inferListingKitSize({ title: "Kit 50 Canetas Personalizadas" }), 50);
  assert.equal(inferListingKitSize({ title: "Copo Aco Inox" }), null);
});

test("agrupa tamanhos diferentes pelo titulo-base sem misturar produtos", () => {
  assert.equal(inferListingGroupLabel({ title: "Kit 10 Canetas Personalizadas" }), "Canetas Personalizadas");
  assert.equal(inferListingGroupLabel({ title: "Kit 100 Canetas Personalizadas" }), "Canetas Personalizadas");
  assert.equal(inferListingGroupLabel({ title: "100 Canetas Metalicas" }), "Canetas Metalicas");
  assert.equal(inferListingGroupLabel({ familyName: "Caneta Metalica", title: "Kit 50 Outro" }), "Caneta Metalica");
});
