import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTinyProduct,
  buildTinyVariantImageUpdate,
  productShouldBeActive,
  validateOlistProduct,
} from "./core.js";

function validProduct() {
  return {
    id: "product-1",
    sku: "FORN-1",
    scx_sku: "SCX-CAN-0001",
    title: "Caneta metalica",
    description: "Caneta de teste",
    publication_status: "published",
    price_amount_in_cents: 4990,
    cost_amount_in_cents: 2200,
    stock_quantity: 1200,
    category: "Canetas",
    supplier_name: "Fornecedor",
    external_id: "FORN-1",
    olist_supplier_id: "123",
    raw_payload: {
      ncm: "9608.10.00",
      peso: "0.01",
      altura: "14",
      largura: "2",
      comprimento: "2",
    },
    images: [{ url: "https://example.com/caneta.jpg" }],
    variants: [
      {
        id: "variant-1",
        scx_sku: "SCX-CAN-0001-AZ",
        supplier_sku: "FORN-1-AZ",
        name: "Azul",
        price_amount_in_cents: 4990,
        cost_amount_in_cents: 2200,
        stock_quantity: 1200,
        attributes: { Cor: "Azul" },
        is_active: true,
        images: [{ url: "https://example.com/caneta-azul.jpg" }],
      },
    ],
    components: [],
    production_steps: [],
  };
}

test("monta produto pai com variacoes oficiais do Tiny", () => {
  const product = validProduct();
  const sent = buildTinyProduct(product, "2", 1, false, 1000);

  assert.deepEqual(validateOlistProduct(product), []);
  assert.equal(sent.produto.classe_produto, "V");
  assert.equal(sent.produto.nome, "Caneta metalica FORN-1");
  assert.ok(!sent.produto.nome.includes("SCX-CAN-0001"));
  assert.equal(sent.produto.preco, "49.90");
  assert.deepEqual(sent.produto.variacoes, [
    {
      variacao: {
        codigo: "SCX-CAN-0001-AZ",
        preco: "49.90",
        estoque_atual: 1200,
        grade: { Cor: "Azul" },
      },
    },
  ]);
  assert.equal(sent.variants[0].variantId, "variant-1");
  assert.deepEqual(sent.produto.anexos, [
    { anexo: "https://example.com/caneta.jpg" },
    { anexo: "https://example.com/caneta-azul.jpg" },
  ]);
  assert.equal(sent.produto.imagens_externas, undefined);
});

test("monta atualizacao de imagem para o id individual da variacao", () => {
  const product = validProduct();
  const update = buildTinyVariantImageUpdate(
    product,
    product.variants[0],
    "901",
    "2",
    1,
    1000,
  );

  assert.equal(update.produto.id, "901");
  assert.equal(update.produto.codigo, "SCX-CAN-0001-AZ");
  assert.equal(update.produto.nome, "Caneta metalica FORN-1 - Azul");
  assert.equal(update.produto.estoque_atual, 1200);
  assert.deepEqual(update.produto.grade, { Cor: "Azul" });
  assert.deepEqual(update.produto.anexos, [
    { anexo: "https://example.com/caneta-azul.jpg" },
  ]);
  assert.equal(update.produto.imagens_externas, undefined);
});

test("inclui id externo da variacao nas atualizacoes", () => {
  const product = validProduct();
  product.olist_product_id = "900";
  product.variants[0].olist_variant_id = "901";

  const sent = buildTinyProduct(product, "2", 1, true, 1000);

  assert.equal(sent.produto.id, "900");
  assert.equal(sent.produto.variacoes[0].variacao.id, "901");
});

test("bloqueia grades repetidas e produtos sem foto", () => {
  const product = validProduct();
  product.images = [];
  product.variants[0].images = [];
  product.variants.push({
    ...product.variants[0],
    id: "variant-2",
    scx_sku: "SCX-CAN-0001-VM",
    supplier_sku: "FORN-1-VM",
  });

  const reasons = validateOlistProduct(product);

  assert.ok(reasons.includes("sem imagem"));
  assert.ok(reasons.includes("grade de variacao repetida"));
});

test("bloqueia variacao ativa sem imagem propria", () => {
  const product = validProduct();
  product.variants[0].images = [];

  assert.ok(validateOlistProduct(product).includes("variacao sem imagem"));
});

test("mantem produto abaixo de 1000 como inativo", () => {
  const product = validProduct();
  product.stock_quantity = 999;

  assert.equal(productShouldBeActive(product, 1000), false);
  assert.equal(buildTinyProduct(product, "2", 1, false, 1000).produto.situacao, "I");
});

test("normaliza dimensoes do produto em caixa", () => {
  const product = validProduct();
  product.raw_payload.altura = 0;
  product.raw_payload.largura = 0;
  product.raw_payload.comprimento = 0;
  product.raw_payload.propriedades = {
    "dimensao-do-produto-caixa": "10,8x14,6x17,6cm",
  };

  assert.deepEqual(validateOlistProduct(product), []);
});

test("bloqueia variacoes com nomes de grade diferentes", () => {
  const product = validProduct();
  product.variants.push({
    ...product.variants[0],
    id: "variant-2",
    scx_sku: "SCX-CAN-0001-VM",
    supplier_sku: "FORN-1-VM",
    attributes: { Vermelho: "Vermelho" },
  });

  assert.ok(
    validateOlistProduct(product).includes(
      "variacoes com estruturas de grade diferentes",
    ),
  );
});

test("permite montar o pai sem filhos durante uma migracao", () => {
  const product = validProduct();
  product.olist_product_id = "900";

  const sent = buildTinyProduct(product, "2", 1, true, 1000, {
    includeVariations: false,
  });

  assert.equal(sent.produto.classe_produto, "V");
  assert.equal(sent.produto.variacoes, undefined);
});
