import { createHash } from "node:crypto";

import { buildMercadoLivreFamilyTitle, orderListingPictureUrls } from "./listingQuality.js";

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
    accepted: errors.length === 0 && (Boolean(responseOk) || causes.length > 0),
    errors,
    warnings,
  };
}

export function classifyOfferFinancials({
  priceInCents,
  saleFeeInCents,
  shippingCostInCents,
  productCostInCents,
  operationalCostInCents = 0,
  taxReservePercentage = 0,
  minProfitInCents = 0,
  minReturnPercentage = 0,
  maxProductCostInCents = Number.MAX_SAFE_INTEGER,
  warningMarginPercentage = 15,
}) {
  const netRevenueInCents = priceInCents - saleFeeInCents - shippingCostInCents;
  const contributionInCents = netRevenueInCents - productCostInCents;
  const taxReserveInCents = Math.round(priceInCents * (taxReservePercentage / 100));
  const estimatedProfitInCents = contributionInCents - operationalCostInCents - taxReserveInCents;
  const profitPercentage = priceInCents > 0
    ? Math.round((estimatedProfitInCents / priceInCents) * 10000) / 100
    : 0;
  const returnPercentage = productCostInCents > 0
    ? Math.round((estimatedProfitInCents / productCostInCents) * 10000) / 100
    : 0;
  const blockReasons = [];
  if (productCostInCents > maxProductCostInCents) blockReasons.push("Custo da mercadoria acima do limite configurado.");
  if (estimatedProfitInCents < minProfitInCents) blockReasons.push("Resultado estimado abaixo do minimo por pedido.");
  if (returnPercentage < minReturnPercentage) blockReasons.push("Retorno sobre o custo abaixo do minimo configurado.");
  return {
    saleFeeInCents,
    shippingCostInCents,
    netRevenueInCents,
    contributionInCents,
    contributionPercentage: profitPercentage,
    operationalCostInCents,
    taxReserveInCents,
    estimatedProfitInCents,
    returnPercentage,
    blockReasons,
    publishable: blockReasons.length === 0,
    financialStatus: blockReasons.length > 0
      ? "blocked"
      : profitPercentage < warningMarginPercentage ? "warning" : "healthy",
  };
}

function attribute(id, valueName, valueId) {
  return {
    id,
    ...(valueId ? { value_id: valueId } : {}),
    ...(valueName ? { value_name: valueName } : {}),
  };
}

export function derivePackOptions(input) {
  const masterUnits = Math.round(Number(input.masterUnits));
  const innerUnits = Math.round(Number(input.innerUnits));
  if (!masterUnits || !innerUnits || innerUnits > masterUnits) return [];
  if (!input.lengthCm || !input.widthCm || !input.heightCm || !input.weightGrams) return [];
  const quantities = [...new Set([innerUnits, innerUnits * 2, masterUnits])]
    .filter((quantity) => quantity <= masterUnits)
    .sort((a, b) => a - b);
  return quantities.map((unitsPerPack) => {
    const ratio = unitsPerPack / masterUnits;
    const confirmed = unitsPerPack === masterUnits;
    return {
      unitsPerPack,
      lengthCm: Number(input.lengthCm),
      widthCm: Number(input.widthCm),
      heightCm: confirmed ? Number(input.heightCm) : Math.max(3, Math.ceil(Number(input.heightCm) * ratio)),
      weightGrams: confirmed ? Math.round(Number(input.weightGrams)) : Math.ceil(Number(input.weightGrams) * ratio),
      confidence: confirmed ? "confirmed" : "estimated",
      warning: confirmed
        ? null
        : `Embalagem estimada proporcionalmente a caixa confirmada de ${masterUnits} unidades. Confira antes da primeira expedicao.`,
    };
  });
}

export function buildPenDescription(unitsPerPack = 200) {
  return [
    `Kit com ${unitsPerPack} canetas esferograficas de aluminio, todas na cor escolhida, com acabamento fosco e tinta azul. Ideal para escritorios, eventos e acoes promocionais.`,
    "",
    "CARACTERISTICAS",
    "- Corpo em aluminio",
    "- Escrita esferografica em azul",
    "- Altura aproximada: 14 cm",
    "- Diametro aproximado: 1,3 cm",
    "- Peso aproximado: 19 g",
    `- Kit com ${unitsPerPack} unidades da mesma cor`,
    "",
    "A cor recebida corresponde a opcao escolhida no anuncio.",
    "",
    "CONTEUDO DA EMBALAGEM",
    `${unitsPerPack} canetas esferograficas.`,
    "",
    "PERSONALIZACAO",
    "Gravacao a laser conforme a arte aprovada para o pedido.",
  ].join("\n");
}

export function buildPenUserProductPayloads(product) {
  const payloads = product.packs.flatMap((pack) => {
    const description = buildPenDescription(pack.unitsPerPack);
    const familyName = buildMercadoLivreFamilyTitle({
      title: "Canetas Metalicas Personalizadas Laser",
      unitsPerPack: pack.unitsPerPack,
      description,
    });
    const commonAttributes = [
      attribute("BRAND", "Generica"),
      attribute("MODEL", product.supplierCode),
      attribute("INK_COLOR", "Azul"),
      attribute("SALE_FORMAT", "Kit", "1359392"),
      attribute("UNITS_PER_PACKAGE", String(pack.unitsPerPack)),
      attribute("UNITS_PER_PACK", String(pack.unitsPerPack)),
      attribute("PACKAGING_TYPE", "Caixa", "131493"),
      attribute("PEN_TYPE", "Caneta esferografica", "930285"),
      attribute("MATERIALS", "Aluminio"),
      attribute("HEIGHT", "14 cm"),
      attribute("DIAMETER", "1.3 cm"),
      attribute("WEIGHT", "19 g"),
      attribute("SELLER_PACKAGE_HEIGHT", `${Math.ceil(pack.heightCm)} cm`),
      attribute("SELLER_PACKAGE_WIDTH", `${Math.ceil(pack.widthCm)} cm`),
      attribute("SELLER_PACKAGE_LENGTH", `${Math.ceil(pack.lengthCm)} cm`),
      attribute("SELLER_PACKAGE_WEIGHT", `${Math.ceil(pack.weightGrams)} g`),
      attribute("ITEM_CONDITION", "Novo", "2230284"),
      attribute("EMPTY_GTIN_REASON", "O produto nao tem codigo cadastrado", "17055160"),
    ];
    return product.variants.map((variant) => {
      const offerPriceInCents = variant.offerPricesInCents[String(pack.unitsPerPack)];
      const color = variant.attributes.Cor;
      const pictures = orderListingPictureUrls({
        variantImages: variant.images,
        productImages: product.images,
        variantAttributes: variant.attributes,
        maxPictures: 12,
      }).map((source) => ({ source }));
      return {
        offerId: `${variant.id}:mercado_livre:${pack.unitsPerPack}`,
        variantId: variant.id,
        sku: `${variant.scxSku}-K${pack.unitsPerPack}`,
        sourceVideoId: product.videoId ?? null,
        color,
        unitsPerPack: pack.unitsPerPack,
        unitPriceInCents: Math.round(offerPriceInCents / pack.unitsPerPack),
        productCostInCents: variant.costInCents * pack.unitsPerPack,
        package: pack,
        description,
        readinessErrors: pictures.length < 2 ? ["A oferta precisa de pelo menos duas imagens coerentes."] : [],
        publishable: pictures.length >= 2,
        financialStatus: "healthy",
        body: {
          family_name: familyName,
          category_id: "MLB44014",
          price: offerPriceInCents / 100,
          currency_id: "BRL",
          available_quantity: Math.floor(variant.stockQuantity / pack.unitsPerPack),
          buying_mode: "buy_it_now",
          listing_type_id: "gold_special",
          condition: "new",
          shipping: { free_shipping: false },
          pictures,
          channels: ["marketplace"],
          attributes: [
            ...commonAttributes,
            attribute("EXTERIOR_COLOR", color, COLOR_IDS[color]),
            attribute("SELLER_SKU", `${variant.scxSku}-K${pack.unitsPerPack}`),
          ],
        },
      };
    });
  });

  return {
    familyName: "Canetas Esferograficas Metalicas de Aluminio",
    description: "Cada tamanho de kit recebe descricao e familia proprias.",
    payloads,
  };
}

export function validatePenSource(product) {
  const errors = [];
  if (!product.supplierCode) errors.push("Codigo do fornecedor ausente.");
  if (!product.variants.length) errors.push("Produto sem variacoes.");
  if (!product.images.length) errors.push("Produto pai sem imagem.");
  if (!product.packs.length) errors.push("Produto sem embalagem confirmada ou estimavel.");
  for (const pack of product.packs) {
    if (pack.unitsPerPack < 2) errors.push("Quantidade do kit invalida.");
    if (!pack.heightCm || !pack.widthCm || !pack.lengthCm) errors.push(`Kit ${pack.unitsPerPack} sem dimensoes de embalagem.`);
    if (!pack.weightGrams) errors.push(`Kit ${pack.unitsPerPack} sem peso bruto.`);
  }
  for (const variant of product.variants) {
    if (!variant.scxSku) errors.push(`Variacao ${variant.id} sem SKU SCX.`);
    if (!variant.attributes.Cor) errors.push(`Variacao ${variant.scxSku} sem cor.`);
    if (!COLOR_IDS[variant.attributes.Cor]) errors.push(`Cor ${variant.attributes.Cor} sem mapeamento Mercado Livre.`);
    if (!variant.images.length) errors.push(`Variacao ${variant.scxSku} sem imagem propria.`);
    if (variant.stockQuantity < 1000) errors.push(`Variacao ${variant.scxSku} abaixo do estoque minimo de 1000.`);
    for (const pack of product.packs) {
      if (!variant.offerPricesInCents[String(pack.unitsPerPack)]) errors.push(`Variacao ${variant.scxSku} sem preco para o kit ${pack.unitsPerPack}.`);
      if (Math.floor(variant.stockQuantity / pack.unitsPerPack) < 1) errors.push(`Variacao ${variant.scxSku} sem estoque para o kit ${pack.unitsPerPack}.`);
    }
  }
  return errors;
}
