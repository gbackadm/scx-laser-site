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

test("normaliza dimensao por caixa usada nas bolsas termicas", () => {
  const raw = {
    propriedades: {
      "quantidade-por-caixa": "100pcs",
      "dimensao-por-caixa": "39x32x47cm",
      "peso-da-caixa": "3,95kgs",
      "dimensao-do-produto": "18x14x13cm",
      "peso-do-produto": "0,028kgs",
    },
  };
  assert.deepEqual(confirmedMasterPack(raw), {
    masterUnits: 100, innerUnits: 0, lengthCm: 39, widthCm: 32, heightCm: 47, weightGrams: 3950,
  });
  assert.deepEqual(confirmedUnitPack(raw), {
    heightCm: 18, widthCm: 14, lengthCm: 13, weightGrams: 28,
  });
});

test("normaliza quantidade da caixa usada nas garrafas plasticas", () => {
  assert.equal(confirmedMasterPack({
    propriedades: {
      "quant-da-caixa": "50pçs",
      "dimensao-da-caixa": "53x53x54 cm",
      "peso-da-caixa": "11,3 kg",
    },
  }).masterUnits, 50);
});
