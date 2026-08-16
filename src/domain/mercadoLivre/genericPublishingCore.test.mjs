import assert from "node:assert/strict";
import test from "node:test";

import { buildGenericUserProductPayloads, deriveProfilePacks, inferMaterial } from "./genericPublishingCore.js";

const categoryAttributes = [
  { id: "BRAND", tags: { required: true } },
  { id: "MODEL", tags: { required: true } },
  { id: "MATERIALS" },
  { id: "COLOR", tags: { variation_attribute: true } },
  { id: "CAPACITY", tags: { variation_attribute: true } },
];

test("normaliza material descrito no feminino", () => {
  assert.equal(inferMaterial("Garrafa Plástica"), "Plastico");
});

function simpleInput() {
  return {
    product: {
      id: "mouse-1",
      title: "Mouse pad de plastico",
      description: "Base antiderrapante",
      supplierCode: "MP01",
      sku: "SCX-MOU-0001",
      stockQuantity: 20,
      images: ["https://example.com/mouse.jpg", "https://example.com/mouse-verso.jpg"],
      offerPricesInCents: { "1": 4990 },
    },
    profile: {
      status: "reviewed",
      categoryId: "MLB123",
      domainId: "MLB-MOUSE_PADS",
      variationAxes: [],
      packQuantities: [1],
      attributeMappings: [
        { targetId: "BRAND", source: "literal", valueName: "Generica" },
        { targetId: "MODEL", source: "supplierCode" },
        { targetId: "MATERIALS", source: "inferredMaterial" },
      ],
    },
    categoryAttributes,
    packages: [{ unitsPerPack: 1, heightCm: 3, widthCm: 20, lengthCm: 25, weightGrams: 180, confidence: "confirmed" }],
  };
}

test("monta produto simples sem inventar variacao", () => {
  const result = buildGenericUserProductPayloads(simpleInput());
  assert.equal(result.publishable, true);
  assert.equal(result.payloads.length, 1);
  assert.equal(result.payloads[0].variationIdentity, "simple");
  assert.equal(result.payloads[0].body.family_name, "Kit 1 Mouse pad de plastico");
  assert.ok(!("variations" in result.payloads[0].body));
  assert.ok(result.payloads[0].body.attributes.some((item) => item.id === "MATERIALS" && item.value_name === "Plastico"));
  assert.ok(result.payloads[0].body.attributes.some((item) => item.id === "SELLER_SKU"));
});

test("garrafa usa somente cor e capacidade comprovadas, bloqueia kit10 estimado e libera caixa confirmada", () => {
  const input = simpleInput();
  input.product = {
    id: "garrafa-1",
    title: "Garrafa squeeze em aco inox 500 ml",
    description: "Garrafa termica",
    supplierCode: "GA500",
    images: ["https://example.com/garrafa-pai.jpg"],
    offerPricesInCents: {},
    variants: [{
      id: "azul-500",
      sku: "SCX-GAR-0001-AZ",
      stockQuantity: 100,
      images: ["https://example.com/azul.jpg"],
      attributes: { Cor: "Azul", Capacidade: "500 ml" },
      offerPricesInCents: { "10": 79900, "50": 359900 },
    }],
  };
  input.profile = {
    status: "reviewed",
    categoryId: "MLBGAR",
    domainId: "MLB-BOTTLES",
    familyName: "Garrafa Squeeze Inox 500 ml",
    variationAxes: ["Cor", "Capacidade"],
    packQuantities: [10, 50],
    attributeMappings: [
      { targetId: "BRAND", source: "literal", valueName: "Generica" },
      { targetId: "MODEL", source: "supplierCode" },
      { targetId: "MATERIALS", source: "inferredMaterial" },
      { targetId: "COLOR", source: "variantAttribute", sourceKey: "Cor", values: { Azul: "52028" } },
      { targetId: "CAPACITY", source: "variantAttribute", sourceKey: "Capacidade" },
    ],
  };
  input.packages = [
    { unitsPerPack: 10, heightCm: 30, widthCm: 30, lengthCm: 40, weightGrams: 6000, confidence: "estimated" },
    { unitsPerPack: 50, heightCm: 60, widthCm: 50, lengthCm: 70, weightGrams: 30000, confidence: "confirmed" },
  ];

  const result = buildGenericUserProductPayloads(input);
  assert.equal(result.payloads.length, 2);
  assert.equal(result.payloads[0].publishable, false);
  assert.equal(result.payloads[0].errors[0].code, "PACKAGE_ESTIMATED");
  assert.equal(result.payloads[1].publishable, true);
  assert.notEqual(result.payloads[0].body.family_name, result.payloads[1].body.family_name);
  assert.equal(result.payloads[1].variationIdentity, "Azul-500 ml");
  assert.equal(inferMaterial(input.product.title), "Aco inoxidavel");
});

test("bloqueia atributo obrigatorio ausente", () => {
  const input = simpleInput();
  input.profile.attributeMappings = input.profile.attributeMappings.filter((item) => item.targetId !== "BRAND");
  const result = buildGenericUserProductPayloads(input);
  assert.equal(result.publishable, false);
  assert.ok(result.errors.some((item) => item.code === "REQUIRED_ATTRIBUTE_MISSING" && item.attributeId === "BRAND"));
});

test("bloqueia eixo de variacao nao permitido pela categoria", () => {
  const input = simpleInput();
  input.product.variants = [{
    id: "grande",
    sku: "SCX-MOU-0001-G",
    stockQuantity: 10,
    images: ["https://example.com/grande.jpg"],
    attributes: { Tamanho: "Grande" },
    offerPricesInCents: { "1": 4990 },
  }];
  input.profile.variationAxes = ["Tamanho"];
  input.profile.attributeMappings.push({ targetId: "SIZE", source: "variantAttribute", sourceKey: "Tamanho" });
  const result = buildGenericUserProductPayloads(input);
  assert.equal(result.publishable, false);
  assert.ok(result.errors.some((item) => item.code === "VARIATION_AXIS_NOT_ALLOWED"));
  assert.equal(result.payloads[0].publishable, false);
});

test("bloqueia variante sem valor no eixo aprovado", () => {
  const input = simpleInput();
  input.product.variants = [{
    id: "sem-cor",
    sku: "SCX-MOU-0001-SC",
    stockQuantity: 10,
    images: ["https://example.com/sem-cor.jpg"],
    attributes: {},
    offerPricesInCents: { "1": 4990 },
  }];
  input.profile.variationAxes = ["Cor"];
  input.profile.attributeMappings.push({ targetId: "COLOR", source: "variantAttribute", sourceKey: "Cor" });
  const result = buildGenericUserProductPayloads(input);
  assert.equal(result.payloads[0].publishable, false);
  assert.ok(result.errors.some((item) => item.code === "VARIATION_VALUE_MISSING"));
});

test("deriva caixa-mestre confirmada e kits menores estimados em grade conservadora", () => {
  const result = deriveProfilePacks({
    desiredQuantities: [10, 50],
    masterPack: { unitsPerPack: 50, heightCm: 30, widthCm: 40, lengthCm: 50, weightGrams: 30000 },
    unit: { heightCm: 25, widthCm: 7, lengthCm: 7, weightGrams: 550 },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.packs.map((pack) => pack.unitsPerPack), [10, 50]);
  assert.equal(result.packs[0].confidence, "estimated");
  assert.equal(result.packs[1].confidence, "confirmed");
  assert.ok(result.packs[0].heightCm <= 30);
  assert.ok(result.packs[0].widthCm <= 40);
  assert.ok(result.packs[0].lengthCm <= 50);
  assert.ok(result.packs[0].weightGrams >= 5775);
});

test("mantem todas as opcoes com estimativa conservadora sem dados unitarios", () => {
  const result = deriveProfilePacks({
    desiredQuantities: [10, 50, 100],
    masterPack: { unitsPerPack: 50, heightCm: 30, widthCm: 40, lengthCm: 50, weightGrams: 30000 },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.packs.map((pack) => pack.unitsPerPack), [10, 50, 100]);
  assert.equal(result.packs[0].confidence, "estimated");
  assert.equal(result.packs[1].confidence, "confirmed");
  assert.equal(result.packs[2].confidence, "estimated");
  assert.match(result.packs[2].warning, /caixa-mestre/);
});

test("prioriza imagens da variacao e respeita o limite da categoria", () => {
  const input = simpleInput();
  input.profile.maxPictures = 2;
  input.product.images = ["https://example.com/pai-1.jpg", "https://example.com/pai-2.jpg"];
  input.product.variants = [{
    id: "azul",
    sku: "SCX-MOU-0001-AZ",
    stockQuantity: 10,
    images: ["https://example.com/azul.jpg", "https://example.com/pai-1.jpg"],
    attributes: { Cor: "Azul" },
    offerPricesInCents: { "1": 4990 },
  }];
  const result = buildGenericUserProductPayloads(input);
  assert.deepEqual(result.payloads[0].body.pictures, [
    { source: "https://example.com/azul.jpg" },
    { source: "https://example.com/pai-1.jpg" },
  ]);
});

test("cria opcoes editaveis quando a caixa-mestre esta incompleta", () => {
  const result = deriveProfilePacks({
    desiredQuantities: [10],
    masterPack: { unitsPerPack: 50, heightCm: 0, widthCm: 40, lengthCm: 50, weightGrams: 30000 },
    unit: { heightCm: 25, widthCm: 7, lengthCm: 7, weightGrams: 550 },
  });
  assert.equal(result.ready, true);
  assert.equal(result.packs.length, 1);
  assert.equal(result.packs[0].confidence, "estimated");
  assert.match(result.packs[0].warning, /Dados logisticos incompletos/);
});

test("bloqueia apenas a variacao sem estoque e preserva a que pode formar o kit", () => {
  const input = simpleInput();
  input.product.variants = [
    { id: "com-estoque", sku: "SCX-MOU-1", stockQuantity: 10, images: ["https://example.com/a.jpg"], attributes: {}, offerPricesInCents: { "1": 4990 } },
    { id: "sem-estoque", sku: "SCX-MOU-2", stockQuantity: 0, images: ["https://example.com/b.jpg"], attributes: {}, offerPricesInCents: { "1": 4990 } },
  ];
  const result = buildGenericUserProductPayloads(input);
  assert.equal(result.payloads[0].publishable, true);
  assert.equal(result.payloads[1].publishable, false);
  assert.ok(result.payloads[1].errors.some((item) => item.code === "STOCK_MISSING"));
});
