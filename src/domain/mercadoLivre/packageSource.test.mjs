import assert from "node:assert/strict";
import test from "node:test";

import { confirmedMasterPack, confirmedUnitPack } from "./packageSource.js";

test("normaliza os aliases logisticos usados pela garrafa GAR-0004", () => {
  const raw = {
    propriedades: {
      "quantidade-por-caixa": "50pcs",
      "dimensao-da-caixa": "79x40x22cm",
      "peso-da-caixa": "6kg",
      "dimensao-do-produto": "18xø7cm",
      "peso-do-produto": "0,075kg",
    },
  };
  assert.deepEqual(confirmedMasterPack(raw), {
    masterUnits: 50, innerUnits: 0, lengthCm: 79, widthCm: 40, heightCm: 22, weightGrams: 6000,
  });
  assert.deepEqual(confirmedUnitPack(raw), {
    heightCm: 18, widthCm: 7, lengthCm: 7, weightGrams: 75,
  });
});
