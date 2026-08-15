import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPenUserProductPayloads,
  classifyMercadoLivreValidation,
  validatePenSource,
} from "./publishingCore.js";

function source() {
  return {
    supplierCode: "CM1027S",
    images: ["https://example.com/pai.jpg"],
    variants: [
      {
        id: "azul",
        scxSku: "SCX-CAN-0021-AZ",
        priceInCents: 1320,
        stockQuantity: 2475,
        attributes: { Cor: "Azul" },
        images: ["https://example.com/azul.jpg"],
      },
      {
        id: "preto",
        scxSku: "SCX-CAN-0021-PT",
        priceInCents: 1320,
        stockQuantity: 10778,
        attributes: { Cor: "Preto" },
        images: ["https://example.com/preto.jpg"],
      },
    ],
  };
}

test("monta um User Product por cor sem array legacy de variacoes", () => {
  const generated = buildPenUserProductPayloads(source());
  assert.equal(generated.payloads.length, 2);
  assert.equal(generated.payloads[0].body.family_name, generated.payloads[1].body.family_name);
  assert.ok(!("title" in generated.payloads[0].body));
  assert.ok(!("variations" in generated.payloads[0].body));
  assert.equal(generated.payloads[0].body.pictures[0].source, "https://example.com/azul.jpg");
  assert.equal(generated.payloads[0].body.pictures[1].source, "https://example.com/pai.jpg");
  assert.equal(generated.payloads[0].body.shipping.free_shipping, false);
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
