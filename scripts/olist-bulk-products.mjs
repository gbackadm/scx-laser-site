import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

import { buildMarketplaceTitle } from "../src/domain/catalog/marketplaceTitles.js";
import {
  buildTinyProduct as buildSharedTinyProduct,
  DEFAULT_BATCH_CALLS_PER_MINUTE as SHARED_DEFAULT_BATCH_CALLS_PER_MINUTE,
  DEFAULT_BATCH_SIZE as SHARED_DEFAULT_BATCH_SIZE,
  summarizeOlistPlan,
} from "../src/domain/olist/core.js";

const { Pool } = pg;

const DEFAULT_BATCH_SIZE = SHARED_DEFAULT_BATCH_SIZE;
const DEFAULT_BATCH_CALLS_PER_MINUTE = SHARED_DEFAULT_BATCH_CALLS_PER_MINUTE;

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#][^=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toMoney(cents) {
  return (Math.max(0, cents ?? 0) / 100).toFixed(2);
}

function normalizeDecimal(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function formatDecimal(value, digits = 3) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return undefined;
  }

  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function truncate(value, maxLength) {
  if (!value) {
    return value;
  }

  const normalized = String(value);
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function parseProductMeasure(measure) {
  if (!measure) {
    return {};
  }

  const heightMatch = String(measure).match(/([\d,.]+)\s*x/i);
  const diameterMatch = String(measure).match(/[øo]\s*([\d,.]+)/i);

  return {
    height: normalizeDecimal(heightMatch?.[1]),
    diameter: normalizeDecimal(diameterMatch?.[1]),
  };
}

function firstProperty(properties, keys) {
  for (const key of keys) {
    if (properties[key] !== undefined && properties[key] !== null && properties[key] !== "") {
      return properties[key];
    }
  }

  return undefined;
}

function rawAttribute(rawPayload, keys) {
  const properties = rawPayload.propriedades ?? {};
  const directValue = firstProperty(properties, keys);
  if (directValue !== undefined) {
    return directValue;
  }

  const properties2 = Array.isArray(rawPayload.propriedades2) ? rawPayload.propriedades2 : [];
  for (const entry of properties2) {
    if (keys.includes(entry?.slug)) {
      return entry.value;
    }
  }

  return undefined;
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const normalized = normalizeDecimal(value);
    if (Number.isFinite(normalized) && normalized > 0) {
      return normalized;
    }
  }

  return undefined;
}

function parseProductDimensions(rawPayload) {
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
  const diameterMatch = value.match(/[Ã¸øo]\s*([\d,.]+)/i);
  const usesDiameter = Boolean(diameterMatch) || /øD|diam|di[âa]metro/i.test(value);
  const diameter = usesDiameter ? normalizeDecimal(diameterMatch?.[1]) ?? numbers[1] : undefined;
  const width = usesDiameter ? diameter : numbers[1];
  const length = usesDiameter ? diameter : numbers[2] ?? numbers[1];

  return {
    height: firstPositiveNumber([numbers[0], rawPayload.altura]),
    width: firstPositiveNumber([width, rawPayload.largura]),
    length: firstPositiveNumber([length, rawPayload.comprimento]),
    diameter: firstPositiveNumber([diameter]),
  };
}

function parseProductWeight(rawPayload) {
  return firstPositiveNumber([
    rawAttribute(rawPayload, ["peso-do-produto", "peso-produto", "peso"]),
    rawPayload.peso,
  ]);
}

function productNcm(rawPayload) {
  return (
    rawAttribute(rawPayload, ["ncm"]) ??
    rawPayload.ncm ??
    rawPayload.variacoes?.find((variation) => variation?.ncm)?.ncm
  );
}

function buildSeoKeywords(product, rawPayload) {
  const categories = Object.values(rawPayload?.categorias ?? {});
  const colors = (rawPayload?.variacoes ?? [])
    .map((variation) => variation?.atributos?.cor?.value)
    .filter(Boolean);

  return Array.from(
    new Set([product.category, product.title, ...categories, ...colors].filter(Boolean)),
  ).join(", ");
}

function buildCategoryTree(product, rawPayload) {
  const supplierCategories = Object.values(rawPayload?.categorias ?? {}).filter(Boolean);
  if (supplierCategories.length > 0) {
    return supplierCategories.join(" >> ");
  }

  return product.category;
}

function buildProductName(product, scxSku) {
  return buildMarketplaceTitle(product.title, "olist", {
    identifiers: [scxSku, product.sku, product.external_id],
  });
}

function buildProductionSteps(product) {
  if (Array.isArray(product.production_steps) && product.production_steps.length > 0) {
    return product.production_steps.map((name) => ({ etapa: { nome: truncate(name, 50) } }));
  }

  return [
    "Separacao fornecedor",
    "Conferencia SCX",
    "Personalizacao e embalagem",
    "Expedicao",
  ].map((name) => ({ etapa: { nome: name } }));
}

function buildStructureItems(product) {
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

function productShouldBeActive(product, stockMinQuantity) {
  return (
    product.publication_status === "published" &&
    Number(product.stock_quantity ?? 0) >= stockMinQuantity
  );
}

function buildTinyProduct(product, origin, sequence, isUpdate, stockMinQuantity) {
  const costInCents = product.cost_amount_in_cents ?? product.price_amount_in_cents;
  const calculatedPriceInCents = Math.round(costInCents * 2.2);
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
  const notes = [
    `Fornecedor: ${product.supplier_name ?? "Nao informado"}`,
    `SKU SCX: ${scxSku}`,
    `Codigo fornecedor: ${supplierSku}`,
    `Regra de preco SCX: custo consolidado x 2,2`,
    `Prazo SCX: 3 dias uteis para Asia Import`,
    firstProperty(properties, ["dimensao-da-caixa", "dimensao-caixa", "medidas-da-caixa"])
      ? `Dimensao da caixa-mae: ${firstProperty(properties, ["dimensao-da-caixa", "dimensao-caixa", "medidas-da-caixa"])}`
      : undefined,
    properties["peso-da-caixa"] ? `Peso da caixa-mae: ${properties["peso-da-caixa"]}` : undefined,
    firstProperty(properties, ["quant-por-caixa", "quantidade-por-caixa", "quant-da-caixa"])
      ? `Quantidade por caixa-mae: ${firstProperty(properties, ["quant-por-caixa", "quantidade-por-caixa", "quant-da-caixa"])}`
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
    nome: buildProductName(product, scxSku),
    unidade: "UN",
    preco: toMoney(calculatedPriceInCents),
    preco_custo: toMoney(costInCents),
    ncm,
    origem: String(origin),
    situacao: productShouldBeActive(product, stockMinQuantity) ? "A" : "I",
    tipo: "P",
    classe_produto: "S",
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
    anexos: externalImageUrls.map((url) => ({ anexo: url })),
    seo: {
      seo_title: truncate(product.title, 120),
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
  };
}

async function postTinyApi(path, params) {
  const response = await fetch(`https://api.tiny.com.br/api2/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Olist respondeu HTTP ${response.status}.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function apiErrorMessage(apiResult) {
  const retorno = apiResult?.retorno;
  if (retorno?.status !== "Erro") return null;

  const messages = (retorno.erros ?? [])
    .map((entry) => entry?.erro)
    .filter(Boolean);

  return messages.join("; ") || "Olist recusou o lote sem detalhar o motivo.";
}

async function markMappingsFailed(pool, batchItems, apiResult) {
  await pool.query(
    `
      UPDATE scx_catalog_product_channel_mappings
      SET sync_status = 'failed',
        raw_response = $2::jsonb,
        updated_at = now()
      WHERE channel = 'olist'
        AND product_id = ANY($1::text[])
    `,
    [batchItems.map((item) => item.productId), JSON.stringify(apiResult)],
  );
}

async function upsertMappings(pool, batchItems, apiResult) {
  const registros = apiResult?.retorno?.registros ?? [];
  for (const entry of registros) {
    const registro = entry?.registro;
    const index = Number.parseInt(registro?.sequencia, 10) - 1;
    const sent = batchItems[index];

    if (!sent || registro?.status !== "OK" || !registro?.id) {
      continue;
    }

    await pool.query(
      `
        INSERT INTO scx_catalog_product_channel_mappings (
          id,
          product_id,
          channel,
          external_id,
          external_sku,
          supplier_sku,
          sync_status,
          last_synced_at,
          raw_response,
          updated_at
        )
        VALUES ($1, $2, 'olist', $3, $4, $5, 'synced', now(), $6, now())
        ON CONFLICT (product_id, channel)
        DO UPDATE SET
          external_id = EXCLUDED.external_id,
          external_sku = EXCLUDED.external_sku,
          supplier_sku = EXCLUDED.supplier_sku,
          sync_status = 'synced',
          last_synced_at = now(),
          raw_response = EXCLUDED.raw_response,
          updated_at = now()
      `,
      [
        `product-channel-${sent.productId}-olist`,
        sent.productId,
        String(registro.id),
        sent.scxSku,
        sent.supplierSku,
        JSON.stringify(registro),
      ],
    );
  }
}

async function getPublicationStockMinQuantity(pool) {
  const { rows } = await pool.query(`
    SELECT COALESCE(publication_stock_min_quantity, 1000)::int AS min_quantity
    FROM scx_catalog_pricing_rules
    WHERE scope = 'global'
      AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  return rows[0]?.min_quantity ?? 1000;
}

function validateProduct(product) {
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

  return reasons;
}

loadLocalEnv();

const execute = process.argv.includes("--execute");
const allProducts = process.argv.includes("--all");
const onlyCreate = process.argv.includes("--create-only");
const onlyUpdate = process.argv.includes("--update-only");
const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;
const origin = getArg("--origin") ?? process.env.OLIST_DEFAULT_ORIGIN;
const limit = allProducts ? undefined : toInteger(getArg("--limit"), 20);
const batchSize = Math.min(toInteger(getArg("--batch-size"), DEFAULT_BATCH_SIZE), 20);
const callsPerMinute = Math.min(
  toInteger(getArg("--batch-calls-per-minute"), DEFAULT_BATCH_CALLS_PER_MINUTE),
  5,
);
const intervalMs = Math.ceil(60_000 / callsPerMinute);

if (onlyCreate && onlyUpdate) {
  console.error("Use only one mode: --create-only or --update-only.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!origin) {
  console.error("OLIST_DEFAULT_ORIGIN is required, or pass --origin.");
  process.exit(1);
}

if (execute && !token) {
  console.error("OLIST_API_TOKEN or TINY_API_TOKEN is required with --execute.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const stockMinQuantity = await getPublicationStockMinQuantity(pool);
  const modeClause = onlyCreate
    ? "AND pcm.external_id IS NULL"
    : onlyUpdate
      ? "AND pcm.external_id IS NOT NULL"
      : "";

  const limitClause = allProducts ? "" : "LIMIT $1";
  const queryParams = allProducts ? [] : [limit];
  const { rows } = await pool.query(
    `
      SELECT
        p.id,
        p.sku,
        p.scx_sku,
        p.title,
        p.description,
        p.publication_status,
        p.price_amount_in_cents,
        p.cost_amount_in_cents,
        p.stock_quantity,
        c.name AS category,
        sp.supplier_name,
        sp.supplier_id,
        sp.external_id,
        sp.raw_payload,
        scm.external_id AS olist_supplier_id,
        pcm.external_id AS olist_product_id,
        coalesce(images.items, '[]'::json) AS images,
        coalesce(variants.items, '[]'::json) AS variants,
        coalesce(components.items, '[]'::json) AS components,
        coalesce(production_steps.items, '[]'::json) AS production_steps
      FROM scx_catalog_products p
      LEFT JOIN scx_catalog_categories c ON c.id = p.category_id
      LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
      LEFT JOIN scx_catalog_supplier_channel_mappings scm
        ON scm.supplier_id = sp.supplier_id
       AND scm.channel = 'olist'
      LEFT JOIN scx_catalog_product_channel_mappings pcm
        ON pcm.product_id = p.id
       AND pcm.channel = 'olist'
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object('url', i.url, 'sort_order', i.sort_order)
          ORDER BY i.sort_order ASC
        ) AS items
        FROM scx_catalog_product_images i
        WHERE i.product_id = p.id
      ) images ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', variant.id,
            'scx_sku', variant.scx_sku,
            'supplier_sku', variant.supplier_sku,
            'name', variant.name,
            'price_amount_in_cents', variant.price_amount_in_cents,
            'cost_amount_in_cents', variant.cost_amount_in_cents,
            'stock_quantity', variant.stock_quantity,
            'attributes', variant.attributes,
            'is_active', variant.is_active,
            'sort_order', variant.sort_order,
            'olist_variant_id', variant_mapping.external_id,
            'images', coalesce(variant_images.items, '[]'::json)
          )
          ORDER BY variant.sort_order ASC, variant.id ASC
        ) AS items
        FROM scx_catalog_product_variants variant
        LEFT JOIN scx_catalog_product_variant_channel_mappings variant_mapping
          ON variant_mapping.variant_id = variant.id
         AND variant_mapping.channel = 'olist'
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object('url', image.url, 'sort_order', image.sort_order)
            ORDER BY image.sort_order ASC
          ) AS items
          FROM scx_catalog_product_variant_images image
          WHERE image.variant_id = variant.id
        ) variant_images ON true
        WHERE variant.product_id = p.id
      ) variants ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'component_sku', pc.component_sku,
            'component_name', pc.component_name,
            'quantity', pc.quantity,
            'sort_order', pc.sort_order
          )
          ORDER BY pc.sort_order ASC
        ) AS items
        FROM scx_catalog_product_components pc
        WHERE pc.product_id = p.id
      ) components ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(ps.name ORDER BY ps.sort_order ASC) AS items
        FROM scx_catalog_product_production_steps ps
        WHERE ps.product_id = p.id
      ) production_steps ON true
      WHERE p.publication_status IN ('published', 'hidden', 'out_of_stock')
        ${modeClause}
      ORDER BY p.updated_at ASC, p.id ASC
      ${limitClause}
    `,
    queryParams,
  );

  const plan = summarizeOlistPlan(rows, stockMinQuantity, batchSize);
  const eligibleRows = plan.eligibleProductsList;
  const createRows = eligibleRows.filter((product) => !product.olist_product_id);
  const updateRows = eligibleRows.filter((product) => product.olist_product_id);
  const createBatches = chunks(createRows, batchSize);
  const updateBatches = chunks(updateRows, batchSize);
  const totalCalls = createBatches.length + updateBatches.length;
  const estimatedSeconds = totalCalls > 0 ? Math.max(1, (totalCalls - 1) * intervalMs / 1000) : 0;

  console.log("Olist bulk plan:");
  console.log(
    JSON.stringify(
      {
        execute,
        allProducts,
        selectedProducts: plan.selectedProducts,
        eligibleProducts: plan.eligibleProducts,
        blockedProducts: plan.blockedProducts,
        blockedByReason: plan.blockedByReason,
        stockMinQuantity: plan.stockMinQuantity,
        willBeActive: plan.willBeActive,
        willBeInactive: plan.willBeInactive,
        creates: plan.creates,
        updates: plan.updates,
        batchSize,
        maxBatchCallsPerMinute: callsPerMinute,
        estimatedApiCalls: totalCalls,
        estimatedDurationSeconds: Math.ceil(estimatedSeconds),
      },
      null,
      2,
    ),
  );

  if (!execute) {
    console.log("Dry run only. Re-run with --execute after reviewing the plan.");
    process.exit(0);
  }

  let callIndex = 0;
  for (const [endpoint, batchGroup] of [
    ["produto.incluir.php", createBatches],
    ["produto.alterar.php", updateBatches],
  ]) {
    for (const batch of batchGroup) {
      if (callIndex > 0) {
        await sleep(intervalMs);
      }

      const items = batch.map((product, index) =>
        buildSharedTinyProduct(
          product,
          origin,
          index + 1,
          endpoint === "produto.alterar.php",
          stockMinQuantity,
        ),
      );
      const apiResult = await postTinyApi(endpoint, {
        token,
        produto: JSON.stringify({
          produtos: items.map((item) => ({ produto: item.produto })),
        }),
        formato: "JSON",
      });

      console.log(`Batch ${callIndex + 1}/${totalCalls} (${endpoint}):`);
      console.log(JSON.stringify(apiResult, null, 2));
      const errorMessage = apiErrorMessage(apiResult);
      if (errorMessage) {
        await markMappingsFailed(pool, items, apiResult);
        throw new Error(`Falha no lote ${callIndex + 1}: ${errorMessage}`);
      }

      await upsertMappings(pool, items, apiResult);
      callIndex += 1;
    }
  }
} finally {
  await pool.end();
}
