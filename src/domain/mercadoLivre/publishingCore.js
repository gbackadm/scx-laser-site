import { createHash } from "node:crypto";

const COLOR_IDS = {
  Azul: "52028",
  Branco: "52055",
  Cinza: "283165",
  Prata: "52053",
  Preto: "52049",
  Verde: "52014",
  Vermelho: "51993",
};

export function publishingInputHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

export function classifyMercadoLivreValidation(responseOk, body) {
  const causes = Array.isArray(body?.cause) ? body.cause : [];
  const errors = causes.filter((cause) => cause?.type === "error");
  const warnings = causes.filter((cause) => cause?.type === "warning");
  return {
    accepted: Boolean(responseOk) || (causes.length > 0 && errors.length === 0),
    errors,
    warnings,
  };
}

function attribute(id, valueName, valueId) {
  return {
    id,
    ...(valueId ? { value_id: valueId } : {}),
    ...(valueName ? { value_name: valueName } : {}),
  };
}

export function buildPenDescription() {
  return [
    "Caneta esferografica de aluminio com acabamento fosco e tinta azul. Leve e pratica para uso diario em escritorios, eventos e acoes promocionais.",
    "",
    "CARACTERISTICAS",
    "- Corpo em aluminio",
    "- Escrita esferografica em azul",
    "- Altura aproximada: 14 cm",
    "- Diametro aproximado: 1,3 cm",
    "- Peso aproximado: 19 g",
    "- Venda por unidade",
    "",
    "A cor recebida corresponde a opcao escolhida no anuncio.",
    "",
    "CONTEUDO DA EMBALAGEM",
    "1 caneta esferografica.",
  ].join("\n");
}

export function buildPenUserProductPayloads(product) {
  const familyName = "Caneta Esferografica Metalica de Aluminio";
  const commonAttributes = [
    attribute("BRAND", "Generica"),
    attribute("MODEL", product.supplierCode),
    attribute("INK_COLOR", "Azul"),
    attribute("SALE_FORMAT", "Unidade", "1359391"),
    attribute("UNITS_PER_PACKAGE", "1"),
    attribute("UNITS_PER_PACK", "1"),
    attribute("PACKAGING_TYPE", "Saquinho plastico"),
    attribute("PEN_TYPE", "Caneta esferografica", "930285"),
    attribute("MATERIALS", "Aluminio"),
    attribute("HEIGHT", "14 cm"),
    attribute("DIAMETER", "1.3 cm"),
    attribute("WEIGHT", "19 g"),
    attribute("ITEM_CONDITION", "Novo", "2230284"),
    attribute("EMPTY_GTIN_REASON", "O produto nao tem codigo cadastrado", "17055160"),
  ];
  const parentImage = product.images[0];

  return {
    familyName,
    description: buildPenDescription(),
    payloads: product.variants.map((variant) => {
      const color = variant.attributes.Cor;
      const firstImage = variant.images[0];
      const pictures = [firstImage, parentImage]
        .filter(Boolean)
        .filter((url, index, values) => values.indexOf(url) === index)
        .map((source) => ({ source }));
      return {
        variantId: variant.id,
        sku: variant.scxSku,
        color,
        body: {
          family_name: familyName,
          category_id: "MLB44014",
          price: variant.priceInCents / 100,
          currency_id: "BRL",
          available_quantity: variant.stockQuantity,
          buying_mode: "buy_it_now",
          listing_type_id: "gold_special",
          condition: "new",
          shipping: { free_shipping: false },
          pictures,
          channels: ["marketplace"],
          attributes: [
            ...commonAttributes,
            attribute("EXTERIOR_COLOR", color, COLOR_IDS[color]),
            attribute("SELLER_SKU", variant.scxSku),
          ],
        },
      };
    }),
  };
}

export function validatePenSource(product) {
  const errors = [];
  if (!product.supplierCode) errors.push("Codigo do fornecedor ausente.");
  if (!product.variants.length) errors.push("Produto sem variacoes.");
  if (!product.images.length) errors.push("Produto pai sem imagem.");
  for (const variant of product.variants) {
    if (!variant.scxSku) errors.push(`Variacao ${variant.id} sem SKU SCX.`);
    if (!variant.attributes.Cor) errors.push(`Variacao ${variant.scxSku} sem cor.`);
    if (!COLOR_IDS[variant.attributes.Cor]) errors.push(`Cor ${variant.attributes.Cor} sem mapeamento Mercado Livre.`);
    if (!variant.images.length) errors.push(`Variacao ${variant.scxSku} sem imagem propria.`);
    if (variant.priceInCents <= 0) errors.push(`Variacao ${variant.scxSku} sem preco.`);
    if (variant.stockQuantity < 1000) errors.push(`Variacao ${variant.scxSku} abaixo do estoque minimo de 1000.`);
  }
  return errors;
}
