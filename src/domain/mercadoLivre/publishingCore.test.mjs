import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPenUserProductPayloads,
  classifyOfferFinancials,
  classifyMercadoLivreValidation,
  derivePackOptions,
  validatePenSource,
} from "./publishingCore.js";

test("classifica margem saudavel, baixa e negativa antes da publicacao", () => {
  assert.equal(classifyOfferFinancials({ priceInCents: 10000, saleFeeInCents: 1000, shippingCostInCents: 1000, productCostInCents: 5000 }).financialStatus, "healthy");
  assert.equal(classifyOfferFinancials({ priceInCents: 10000, saleFeeInCents: 1000, shippingCostInCents: 1000, productCostInCents: 7000 }).financialStatus, "warning");
  const blocked = classifyOfferFinancials({ priceInCents: 10000, saleFeeInCents: 1500, shippingCostInCents: 2000, productCostInCents: 7000 });
  assert.equal(blocked.financialStatus, "blocked");
  assert.equal(blocked.publishable, false);
});

test("bloqueia lucro minimo, retorno e custo maximo configurados", () => {
  const lowProfit = classifyOfferFinancials({ priceInCents: 10000, saleFeeInCents: 1000, shippingCostInCents: 1000, productCostInCents: 5000, operationalCostInCents: 1000, minProfitInCents: 2500 });
  assert.equal(lowProfit.publishable, false);
  assert.match(lowProfit.blockReasons.join(" "), /Resultado estimado/);

  const lowReturn = classifyOfferFinancials({ priceInCents: 10000, saleFeeInCents: 1000, shippingCostInCents: 1000, productCostInCents: 6000, minReturnPercentage: 50 });
  assert.equal(lowReturn.publishable, false);
  assert.match(lowReturn.blockReasons.join(" "), /Retorno sobre o custo/);

  const expensive = classifyOfferFinancials({ priceInCents: 900000, saleFeeInCents: 0, shippingCostInCents: 0, productCostInCents: 500001, maxProductCostInCents: 500000 });
  assert.equal(expensive.publishable, false);
  assert.match(expensive.blockReasons.join(" "), /Custo da mercadoria/);
});

function source() {
  return {
    supplierCode: "CM1027S",
    images: ["https://example.com/pai.jpg"],
    packs: [{ unitsPerPack: 200, heightCm: 17, widthCm: 16.5, lengthCm: 23, weightGrams: 4300, confidence: "confirmed", warning: null }],
    variants: [
      {
        id: "azul",
        scxSku: "SCX-CAN-0021-AZ",
        offerPricesInCents: { "200": 224390 },
        costInCents: 600,
        stockQuantity: 2475,
        attributes: { Cor: "Azul" },
        images: ["https://example.com/azul.jpg"],
      },
      {
        id: "preto",
        scxSku: "SCX-CAN-0021-PT",
        offerPricesInCents: { "200": 224390 },
        costInCents: 600,
        stockQuantity: 10778,
        attributes: { Cor: "Preto" },
        images: ["https://example.com/preto.jpg"],
      },
    ],
  };
}

test("monta um User Product de kit por cor sem array legacy de variacoes", () => {
  const generated = buildPenUserProductPayloads(source());
  assert.equal(generated.payloads.length, 2);
  assert.equal(generated.payloads[0].body.family_name, generated.payloads[1].body.family_name);
  assert.ok(!("title" in generated.payloads[0].body));
  assert.ok(!("variations" in generated.payloads[0].body));
  assert.equal(generated.payloads[0].body.pictures[0].source, "https://example.com/azul.jpg");
  assert.equal(generated.payloads[0].body.pictures[1].source, "https://example.com/pai.jpg");
  assert.equal(generated.payloads[0].body.shipping.free_shipping, false);
  assert.equal(generated.payloads[0].body.available_quantity, 12);
  assert.equal(generated.payloads[0].body.price, 2243.9);
  assert.equal(generated.payloads[0].unitsPerPack, 200);
  assert.equal(generated.payloads[0].unitPriceInCents, 1122);
  assert.equal(generated.payloads[0].productCostInCents, 120000);
  assert.match(generated.payloads[0].sku, /-K200$/);
  assert.ok(generated.payloads[0].body.attributes.some((item) => item.id === "SELLER_PACKAGE_WEIGHT" && item.value_name === "4300 g"));
});

test("deriva kits menores e preserva a caixa-mae confirmada", () => {
  const packs = derivePackOptions({ masterUnits: 200, innerUnits: 50, heightCm: 17, widthCm: 16.5, lengthCm: 23, weightGrams: 4300 });
  assert.deepEqual(packs.map((pack) => pack.unitsPerPack), [50, 100, 200]);
  assert.deepEqual(packs.map((pack) => pack.heightCm), [5, 9, 17]);
  assert.deepEqual(packs.map((pack) => pack.weightGrams), [1075, 2150, 4300]);
  assert.equal(packs[0].confidence, "estimated");
  assert.equal(packs[2].confidence, "confirmed");
});

test("aceita resposta do validador que contem somente avisos", () => {
  const result = classifyMercadoLivreValidation(false, {
    cause: [{ type: "warning", code: "shipping.lost_me1_by_user" }],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.errors.length, 0);
});

test("rejeita resposta do validador que contem erro", () => {
  const result = classifyMercadoLivreValidation(false, {
    cause: [{ type: "error", code: "item.attribute.missing" }],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.errors.length, 1);
});

test("rejeita causa de erro mesmo quando a resposta HTTP foi aceita", () => {
  const result = classifyMercadoLivreValidation(true, { cause: [{ type: "error", code: "invalid" }] });
  assert.equal(result.accepted, false);
});

test("bloqueia cor desconhecida, imagem ausente e estoque baixo", () => {
  const invalid = source();
  invalid.variants[0].attributes.Cor = "Roxo";
  invalid.variants[0].images = [];
  invalid.variants[0].stockQuantity = 999;
  const errors = validatePenSource(invalid);
  assert.ok(errors.some((error) => error.includes("sem mapeamento")));
  assert.ok(errors.some((error) => error.includes("sem imagem propria")));
  assert.ok(errors.some((error) => error.includes("estoque minimo")));
});
