import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarketplaceTitle,
  normalizeCommercialTitle,
} from "./marketplaceTitles.js";

test("remove identificadores e termos que nao pertencem ao titulo de venda", () => {
  assert.equal(
    normalizeCommercialTitle(
      "Caneta Metalica SCX-CAN-0001 - FORN-77 pronta entrega",
      ["FORN-77"],
    ),
    "Caneta Metalica",
  );
});

test("expande abreviacoes e limpa pontuacao desnecessaria", () => {
  assert.equal(
    normalizeCommercialTitle("Conj. Copos c/ Tampa (500 ml)*"),
    "Conjunto de Copos com Tampa 500 ml",
  );
});

test("respeita o teto do canal sem cortar uma palavra", () => {
  const title = buildMarketplaceTitle(
    "Garrafa termica em aco inoxidavel com tampa e capacidade de 500 ml",
    "mercado_livre",
  );

  assert.ok(title.length <= 60);
  assert.equal(title, "Garrafa termica em aco inoxidavel com tampa e capacidade");
});
