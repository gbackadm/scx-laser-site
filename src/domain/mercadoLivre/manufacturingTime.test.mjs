import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MANUFACTURING_TIME_DAYS,
  manufacturingTimeDaysFrom,
  normalizeManufacturingTimeDays,
  withManufacturingTime,
} from "./manufacturingTime.js";

test("usa cinco dias como prazo padrao", () => {
  assert.equal(DEFAULT_MANUFACTURING_TIME_DAYS, 5);
  assert.deepEqual(withManufacturingTime([], DEFAULT_MANUFACTURING_TIME_DAYS), [
    { id: "MANUFACTURING_TIME", value_name: "5 dias" },
  ]);
});

test("preserva outros termos e substitui somente o prazo de producao", () => {
  const terms = [
    { id: "WARRANTY_TYPE", value_name: "Garantia do vendedor" },
    { id: "MANUFACTURING_TIME", value_name: "3 dias" },
  ];
  assert.deepEqual(withManufacturingTime(terms, 8), [
    { id: "WARRANTY_TYPE", value_name: "Garantia do vendedor" },
    { id: "MANUFACTURING_TIME", value_name: "8 dias" },
  ]);
  assert.equal(manufacturingTimeDaysFrom(terms), 3);
});

test("permite retirar o prazo e rejeita valores fora do limite do ML", () => {
  assert.deepEqual(withManufacturingTime([{ id: "MANUFACTURING_TIME", value_name: "5 dias" }], null), []);
  assert.throws(() => normalizeManufacturingTimeDays(0), /entre 1 e 60/);
  assert.throws(() => normalizeManufacturingTimeDays(61), /entre 1 e 60/);
});
