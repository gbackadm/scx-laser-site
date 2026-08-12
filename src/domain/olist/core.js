import { buildMarketplaceTitle } from "../catalog/marketplaceTitles.js";

export const OLIST_CHANNEL = "olist";
export const DEFAULT_BATCH_SIZE = 20;
export const DEFAULT_BATCH_CALLS_PER_MINUTE = 5;
export const DEFAULT_STOCK_MIN_QUANTITY = 1000;

export function toMoney(cents) {
  return (Math.max(0, cents ?? 0) / 100).toFixed(2);
}

export function normalizeDecimal(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const number = Number.parseFloat(normalized);

  return Number.isFinite(number) ? number : undefined;
}

export function formatDecimal(value, digits = 3) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return undefined;
  }

  return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function truncate(value, maxLength) {
  if (!value) {
    return value;
  }

  const normalized = String(value);
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength)
    : normalized;
}

export function firstProperty(properties, keys) {
  for (const key of keys) {
    if (
      properties[key] !== undefined &&
      properties[key] !== null &&
      properties[key] !== ""
    ) {
      return properties[key];
    }
  }

  return undefined;
}

export function rawAttribute(rawPayload, keys) {
  const properties = rawPayload.propriedades ?? {};
  const directValue = firstProperty(properties, keys);
  if (directValue !== undefined) {
    return directValue;
  }

  const properties2 = Array.isArray(rawPayload.propriedades2)
    ? rawPayload.propriedades2
    : [];
  for (const entry of properties2) {
    if (keys.includes(entry?.slug)) {
      return entry.value;
    }
  }

  return undefined;
}

export function firstPositiveNumber(values) {
  for (const value of values) {
    const normalized = normalizeDecimal(value);
    if (Number.isFinite(normalized) && normalized > 0) {
      return normalized;
    }
  }

  return undefined;
}

export function parseProductDimensions(rawPayload) {
  const measure = rawAttribute(rawPayload, [
    "medidas-do-produto",
    "medida-do-produto",
    "dimensao-do-produto",
    "dimensao-produto",
    "dimensoes-do-produto",
    "dimensoes-produto",
    "dimensao-da-embalagem",
    "medidas",
    "dimensao",
  ]);
  const value = String(measure ?? "");
  const numbers = value.match(/\d+(?:[,.]\d+)?/g)?.map(normalizeDecimal) ?? [];
  const diameterMatch = value.match(/[\u00f8o]\s*([\d,.]+)/i);
  const usesDiameter = Boolean(diameterMatch) || /\u00f8D|diam|diametro/i.test(value);
  const diameter = usesDiameter
    ? normalizeDecimal(diameterMatch?.[1]) ?? numbers[1]
    : undefined;
  const width = usesDiameter ? diameter : numbers[1];
  const length = usesDiameter ? diameter : numbers[2] ?? numbers[1];

  return {
    height: firstPositiveNumber([numbers[0], rawPayload.altura]),
    width: firstPositiveNumber([width, rawPayload.largura]),
    length: firstPositiveNumber([length, rawPayload.comprimento]),
    diameter: firstPositiveNumber([diameter]),
  };
}

export function parseProductWeight(rawPayload) {
  return firstPositiveNumber([
    rawAttribute(rawPayload, ["peso-do-produto", "peso-produto", "peso"]),
    rawPayload.peso,
  ]);
}

export function productNcm(rawPayload) {
  return (
    rawAttribute(rawPayload, ["ncm"]) ??
    rawPayload.ncm ??
    rawPayload.variacoes?.find((variation) => variation?.ncm)?.ncm
  );
}

export function buildSeoKeywords(product, rawPayload) {
  const categories = Object.values(rawPayload?.categorias ?? {});
  const colors = (rawPayload?.variacoes ?? [])
    .map((variation) => variation?.atributos?.cor?.value)
    .filter(Boolean);

  return Array.from(
    new Set([product.category, product.title, ...categories, ...colors].filter(Boolean)),
  ).join(", ");
}

export function buildCategoryTree(product, rawPayload) {
  const supplierCategories = Object.values(rawPayload?.categorias ?? {}).filter(Boolean);
  if (supplierCategories.length > 0) {
    return supplierCategories.join(" >> ");
  }

  return product.category;
}

export function buildProductName(product) {
  return buildMarketplaceTitle(product.title, "olist", {
    identifiers: [product.scx_sku, product.sku, product.external_id],
  });
}

export function buildProductionSteps(product) {
  if (Array.isArray(product.production_steps) && product.production_steps.length > 0) {
    return product.production_steps.map((name) => ({
      etapa: { nome: truncate(name, 50) },
    }));
  }

  return [
    "Separacao fornecedor",
    "Conferencia SCX",
    "Personalizacao e embalagem",
    "Expedicao",
  ].map((name) => ({ etapa: { nome: name } }));
}

export function buildStructureItems(product) {
  if (!Array.isArray(product.components) || product.components.length === 0) {
    return undefined;
  }

  return product.components.map((component) => ({
    item: {
      codigo: truncate(component.component_sku, 60),
      descricao: truncate(component.component_name, 120),
      quantidade: formatDecimal(Number(component.quantity), 3),
    },
  }));
}

export function productShouldBeActive(product, stockMinQuantity) {
  return (
    product.publication_status === "published" &&
    Number(product.stock_quantity ?? 0) >= stockMinQuantity
  );
}

function normalizedVariantGrade(attributes) {
  return Object.fromEntries(
    Object.entries(attributes ?? {})
      .map(([name, value]) => [String(name).trim(), String(value).trim()])
      .filter(([name, value]) => Boolean(name && value)),
  );
}

function buildTinyVariations(product, isUpdate) {
  const variants = Array.isArray(product.variants) ? product.variants : [];

  return variants
    .filter((variant) => variant.is_active || variant.olist_variant_id)
    .map((variant) => {
      const tinyVariation = {
        codigo: truncate(variant.scx_sku, 30),
        preco: toMoney(variant.price_amount_in_cents),
        estoque_atual: variant.is_active ? variant.stock_quantity : 0,
        grade: normalizedVariantGrade(variant.attributes),
      };

      if (isUpdate && variant.olist_variant_id) {
        tinyVariation.id = variant.olist_variant_id;
      }

      return {
        variacao: tinyVariation,
        mapping: {
          variantId: variant.id,
          scxSku: variant.scx_sku,
          supplierSku: variant.supplier_sku,
        },
      };
    });
}

function variantGradeSchema(variant) {
  return Object.keys(normalizedVariantGrade(variant.attributes))
    .map((name) => name.toLocaleLowerCase("pt-BR"))
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

export function validateOlistProduct(product) {
  const rawPayload = product.raw_payload ?? {};
  const productMeasure = parseProductDimensions(rawPayload);
  const productWeight = parseProductWeight(rawPayload);
  const reasons = [];

  if (!product.scx_sku) {
    reasons.push("sem SKU SCX");
  }
  if (!product.title) {
    reasons.push("sem nome");
  }
  if (!product.price_amount_in_cents || product.price_amount_in_cents <= 0) {
    reasons.push("sem preco de venda");
  }
  if (!product.cost_amount_in_cents || product.cost_amount_in_cents <= 0) {
    reasons.push("sem custo");
  }
  if (!productNcm(rawPayload)) {
    reasons.push("sem NCM");
  }
  if (!Number.isFinite(productWeight)) {
    reasons.push("sem peso do produto");
  }
  if (
    !Number.isFinite(productMeasure.height) ||
    !Number.isFinite(productMeasure.width) ||
    !Number.isFinite(productMeasure.length)
  ) {
    reasons.push("sem medidas normalizadas");
  }
  if (!Array.isArray(product.images) || product.images.length === 0) {
    reasons.push("sem imagem");
  }
  if (!product.olist_supplier_id) {
    reasons.push("sem fornecedor Olist mapeado");
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length > 0) {
    const activeVariants = variants.filter((variant) => variant.is_active);
    const variantSkus = activeVariants.map((variant) => variant.scx_sku);
    const supplierSkus = activeVariants.map((variant) => variant.supplier_sku);
    const grades = activeVariants.map((variant) =>
      JSON.stringify(
        Object.entries(normalizedVariantGrade(variant.attributes)).sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      ),
    );
    const gradeSchemas = activeVariants.map(variantGradeSchema);

    if (activeVariants.length === 0) {
      reasons.push("sem variacao ativa");
    }
    if (
      activeVariants.some(
        (variant) =>
          !variant.scx_sku ||
          !variant.supplier_sku ||
          !variant.name ||
          variant.price_amount_in_cents <= 0 ||
          variant.cost_amount_in_cents <= 0 ||
          Object.keys(normalizedVariantGrade(variant.attributes)).length === 0,
      )
    ) {
      reasons.push("variacao incompleta");
    }
    if (new Set(variantSkus).size !== variantSkus.length) {
      reasons.push("SKU de variacao repetido");
    }
    if (new Set(supplierSkus).size !== supplierSkus.length) {
      reasons.push("codigo de fornecedor da variacao repetido");
    }
    if (new Set(grades).size !== grades.length) {
      reasons.push("grade de variacao repetida");
    }
    if (new Set(gradeSchemas).size > 1) {
      reasons.push("variacoes com estruturas de grade diferentes");
    }
  }

  return reasons;
}

export function buildTinyProduct(
  product,
  origin,
  sequence,
  isUpdate,
  stockMinQuantity,
  options = {},
) {
  const costInCents = product.cost_amount_in_cents ?? product.price_amount_in_cents;
  const rawPayload = product.raw_payload ?? {};
  const scxSku = product.scx_sku ?? product.sku;
  const supplierSku = product.external_id ?? rawPayload.referencia ?? product.sku;
  const properties = rawPayload.propriedades ?? {};
  const ncm = productNcm(rawPayload);
  const productMeasure = parseProductDimensions(rawPayload);
  const productWeight = parseProductWeight(rawPayload);
  const boxWeight = normalizeDecimal(properties["peso-da-caixa"]);
  const unitsPerInnerBox = String(
    firstProperty(properties, [
      "quant-por-caixinha",
      "quant-por-caixa",
      "quantidade-por-caixa",
      "quant-da-caixa",
    ]) ?? "",
  )
    .replace(/\D/g, "")
    .slice(0, 3);
  const allImageUrls = product.images.map((image) => image.url).filter(Boolean);
  const externalImageUrls = allImageUrls.slice(0, 10);
  const description = product.description ?? product.title;
  const structureItems = buildStructureItems(product);
  const tinyVariations = buildTinyVariations(product, isUpdate);
  const notes = [
    `Fornecedor: ${product.supplier_name ?? "Nao informado"}`,
    `SKU SCX: ${scxSku}`,
    `Codigo fornecedor: ${supplierSku}`,
    "Preco final calculado e validado no catalogo SCX",
    "Prazo SCX: 3 dias uteis para Asia Import",
    firstProperty(properties, [
      "dimensao-da-caixa",
      "dimensao-caixa",
      "medidas-da-caixa",
    ])
      ? `Dimensao da caixa-mae: ${firstProperty(properties, [
          "dimensao-da-caixa",
          "dimensao-caixa",
          "medidas-da-caixa",
        ])}`
      : undefined,
    properties["peso-da-caixa"]
      ? `Peso da caixa-mae: ${properties["peso-da-caixa"]}`
      : undefined,
    firstProperty(properties, [
      "quant-por-caixa",
      "quantidade-por-caixa",
      "quant-da-caixa",
    ])
      ? `Quantidade por caixa-mae: ${firstProperty(properties, [
          "quant-por-caixa",
          "quantidade-por-caixa",
          "quant-da-caixa",
        ])}`
      : undefined,
    rawPayload.origem_faturamento
      ? `Origem de faturamento fornecedor: ${rawPayload.origem_faturamento}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const tinyProduct = {
    sequencia: String(sequence),
    codigo: truncate(scxSku, 30),
    nome: buildProductName(product),
    unidade: "UN",
    preco: toMoney(product.price_amount_in_cents),
    preco_custo: toMoney(costInCents),
    ncm,
    origem: String(origin),
    situacao: productShouldBeActive(product, stockMinQuantity) ? "A" : "I",
    tipo: "P",
    classe_produto: tinyVariations.length > 0 ? "V" : "S",
    categoria: buildCategoryTree(product, rawPayload),
    descricao_complementar: description,
    obs: notes,
    estrutura: structureItems,
    etapas: buildProductionSteps(product),
    estoque_atual: product.stock_quantity,
    id_fornecedor: product.olist_supplier_id,
    codigo_pelo_fornecedor: truncate(supplierSku, 20),
    unidade_por_caixa: unitsPerInnerBox || undefined,
    peso_liquido: formatDecimal(productWeight),
    peso_bruto: formatDecimal(productWeight) ?? formatDecimal(boxWeight),
    tipo_embalagem: productMeasure.diameter ? "3" : "2",
    altura_embalagem: formatDecimal(productMeasure.height, 2),
    largura_embalagem: formatDecimal(productMeasure.width, 2),
    comprimento_embalagem: formatDecimal(productMeasure.length, 2),
    diametro_embalagem: formatDecimal(productMeasure.diameter, 2),
    dias_preparacao: "3",
    imagens_externas: externalImageUrls.map((url) => ({
      imagem_externa: { url },
    })),
    variacoes:
      options.includeVariations !== false && tinyVariations.length > 0
        ? tinyVariations.map(({ variacao }) => ({ variacao }))
        : undefined,
    seo: {
      seo_title: buildMarketplaceTitle(product.title, "site", {
        identifiers: [scxSku, supplierSku],
      }),
      seo_keywords: truncate(buildSeoKeywords(product, rawPayload), 255),
      seo_description: truncate(product.description ?? product.title, 255),
      link_video: truncate(rawPayload.video, 100),
    },
  };

  if (isUpdate) {
    tinyProduct.id = product.olist_product_id;
  }

  return {
    produto: tinyProduct,
    scxSku,
    supplierSku,
    productId: product.id,
    variants: tinyVariations.map(({ mapping }) => mapping),
  };
}

export function summarizeOlistPlan(products, stockMinQuantity, batchSize = DEFAULT_BATCH_SIZE) {
  const validation = products.map((product) => ({
    product,
    reasons: validateOlistProduct(product),
  }));
  const eligibleRows = validation
    .filter((entry) => entry.reasons.length === 0)
    .map((entry) => entry.product);
  const blockedRows = validation.filter((entry) => entry.reasons.length > 0);
  const blockedByReason = blockedRows.reduce((summary, entry) => {
    for (const reason of entry.reasons) {
      summary[reason] = (summary[reason] ?? 0) + 1;
    }
    return summary;
  }, {});
  const createRows = eligibleRows.filter((product) => !product.olist_product_id);
  const updateRows = eligibleRows.filter((product) => product.olist_product_id);
  const conversionRows = updateRows.filter(
    (product) =>
      product.variants?.some((variant) => variant.is_active) &&
      !product.variants?.some((variant) => variant.olist_variant_id),
  );
  const regularUpdateRows = updateRows.filter(
    (product) => !conversionRows.includes(product),
  );
  const willBeActive = eligibleRows.filter((product) =>
    productShouldBeActive(product, stockMinQuantity),
  ).length;
  const estimatedApiCalls =
    Math.ceil(createRows.length / batchSize) +
    Math.ceil(regularUpdateRows.length / batchSize) +
    Math.ceil(conversionRows.length / batchSize) * 2;

  return {
    selectedProducts: products.length,
    eligibleProducts: eligibleRows.length,
    blockedProducts: blockedRows.length,
    blockedByReason,
    stockMinQuantity,
    willBeActive,
    willBeInactive: eligibleRows.length - willBeActive,
    creates: createRows.length,
    updates: updateRows.length,
    classConversions: conversionRows.length,
    estimatedApiCalls,
    eligibleProductsList: eligibleRows,
    blockedProductsList: blockedRows.map((entry) => ({
      product: entry.product,
      reasons: entry.reasons,
    })),
  };
}
