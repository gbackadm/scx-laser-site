import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

import { buildMarketplaceTitle } from "../src/domain/catalog/marketplaceTitles.js";

const { Pool } = pg;

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
  const directValue = firstProperty(rawPayload.propriedades ?? {}, keys);
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

function stripAccents(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildOlistTags(attributes) {
  return attributes
    .map((attribute) => {
      const label = stripAccents(attribute.name)
        .replace(/Quant\./i, "Qtd")
        .replace(/Dimensao/i, "Dim")
        .replace(/Medidas do produto/i, "Medidas")
        .replace(/Peso do produto/i, "Peso")
        .replace(/Peso da caixa/i, "Peso caixa")
        .replace(/Categorias do fornecedor/i, "Cat forn");
      const value = stripAccents(attribute.value)
        .replace(/peças|pecas|pçs/gi, "pcs")
        .replace(/\s+/g, " ");

      return truncate(`${label}: ${value}`, 50);
    })
    .filter(Boolean)
    .slice(0, 20);
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
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function upsertProductChannelMapping(pool, product, scxSku, supplierSku, apiResult) {
  const registro = apiResult?.retorno?.registros?.[0]?.registro;
  const externalId = String(registro?.id ?? product.olist_product_id ?? "");

  if (registro?.status !== "OK" || !externalId) {
    return;
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
      `product-channel-${product.id}-olist`,
      product.id,
      externalId,
      scxSku,
      supplierSku,
      JSON.stringify(registro),
    ],
  );
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

loadLocalEnv();

const sku = getArg("--sku") ?? process.env.OLIST_TEST_SKU;
const execute = process.argv.includes("--execute");
const withVariations = process.argv.includes("--with-variations");
const withTagNames = process.argv.includes("--with-tag-names");
const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;
const origin = getArg("--origin") ?? process.env.OLIST_DEFAULT_ORIGIN;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!sku) {
  console.error("Use --sku SKU_DO_PRODUTO or set OLIST_TEST_SKU.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const stockMinQuantity = await getPublicationStockMinQuantity(pool);
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
        scm.external_code AS olist_supplier_code,
        pcm.external_id AS olist_product_id,
        coalesce(images.items, '[]'::json) AS images,
        coalesce(attributes.items, '[]'::json) AS attributes,
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
            'scope', a.scope,
            'name', a.name,
            'slug', a.slug,
            'value', a.value,
            'sort_order', a.sort_order
          )
          ORDER BY a.scope ASC, a.sort_order ASC
        ) AS items
        FROM scx_catalog_product_attributes a
        WHERE a.product_id = p.id
      ) attributes ON true
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
      WHERE p.sku = $1
         OR p.scx_sku = $1
    `,
    [sku],
  );

  const product = rows[0];
  if (!product) {
    console.error(`Product not found for SKU ${sku}.`);
    process.exit(1);
  }

  if (!origin) {
    console.error("OLIST_DEFAULT_ORIGIN is required, or pass --origin.");
    console.error("For imported goods bought in Brazil, Tiny/Olist commonly uses origin code 2.");
    process.exit(1);
  }

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
  const variations = Array.isArray(rawPayload.variacoes)
    ? rawPayload.variacoes.map((variation) => {
        const colorCode = String(
          variation?.atributos?.cor?.name ?? variation?.referencia ?? variation.nome ?? "",
        )
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .toUpperCase();

        return {
          variacao: {
            codigo: truncate(`${scxSku}-${colorCode || "VAR"}`, 30),
          preco: toMoney(Math.round(normalizeDecimal(variation.preco) * 100 * 2.2)),
          estoque_atual: variation.qtd_estoque ?? 0,
          grade: {
            Cor: variation?.atributos?.cor?.value ?? variation.nome,
          },
        },
      };
      })
    : [];
  const shouldSendVariations = withVariations && variations.length > 1;
  const structureItems = buildStructureItems(product);

  const payload = {
    produtos: [
      {
        produto: {
          sequencia: "1",
          codigo: truncate(scxSku, 30),
          nome: buildProductName(product, scxSku),
          unidade: "UN",
          preco: toMoney(calculatedPriceInCents),
          preco_custo: toMoney(costInCents),
          ncm,
          origem: String(origin),
          situacao: productShouldBeActive(product, stockMinQuantity) ? "A" : "I",
          tipo: "P",
          classe_produto: shouldSendVariations ? "V" : "S",
          categoria: buildCategoryTree(product, rawPayload),
          descricao_complementar: description,
          obs: notes,
          estrutura: structureItems,
          etapas: buildProductionSteps(product),
          tags: withTagNames ? buildOlistTags(product.attributes ?? []) : undefined,
          estoque_atual: product.stock_quantity,
          id_fornecedor: product.olist_supplier_id,
          codigo_pelo_fornecedor: truncate(supplierSku, 20),
          unidade_por_caixa: unitsPerInnerBox || undefined,
          peso_liquido: formatDecimal(productWeight),
          peso_bruto: formatDecimal(productWeight),
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
          variacoes: shouldSendVariations ? variations : undefined,
        },
      },
    ],
  };

  if (boxWeight && !payload.produtos[0].produto.peso_bruto) {
    payload.produtos[0].produto.peso_bruto = formatDecimal(boxWeight);
  }

  console.log("Prepared Olist test payload:");
  console.log(JSON.stringify(payload, null, 2));

  if (!token) {
    console.error("OLIST_API_TOKEN or TINY_API_TOKEN is required to call Olist.");
    process.exit(1);
  }

  const searchResult = await postTinyApi("produtos.pesquisa.php", {
    token,
    pesquisa: scxSku,
    formato: "JSON",
  });

  console.log("Search result for SCX SKU:");
  console.log(JSON.stringify(searchResult, null, 2));

  const searchErrorCode = String(searchResult?.retorno?.codigo_erro ?? "");
  const hasNoSearchResults =
    searchResult?.retorno?.status === "Erro" && searchErrorCode === "20";

  if (searchResult?.retorno?.status === "Erro" && !hasNoSearchResults) {
    console.error("Olist search failed. Product was not sent.");
    process.exit(1);
  }

  let existingProducts = hasNoSearchResults
    ? []
    : (searchResult?.retorno?.produtos ?? []);
  let exactMatch = existingProducts.find((entry) => entry?.produto?.codigo === scxSku);

  if (!exactMatch && supplierSku !== scxSku) {
    const legacySearchResult = await postTinyApi("produtos.pesquisa.php", {
      token,
      pesquisa: supplierSku,
      formato: "JSON",
    });

    console.log("Search result for supplier SKU:");
    console.log(JSON.stringify(legacySearchResult, null, 2));

    const legacySearchErrorCode = String(legacySearchResult?.retorno?.codigo_erro ?? "");
    const hasNoLegacyResults =
      legacySearchResult?.retorno?.status === "Erro" && legacySearchErrorCode === "20";

    if (legacySearchResult?.retorno?.status === "Erro" && !hasNoLegacyResults) {
      console.error("Olist legacy search failed. Product was not sent.");
      process.exit(1);
    }

    existingProducts = hasNoLegacyResults ? [] : (legacySearchResult?.retorno?.produtos ?? []);
    exactMatch = existingProducts.find((entry) => entry?.produto?.codigo === supplierSku);
  }

  if (exactMatch) {
    payload.produtos[0].produto.id = exactMatch.produto.id;
  }

  if (!execute) {
    const action = exactMatch ? "update" : "create";
    console.log(`Dry run only. Re-run with --execute to ${action} the inactive product.`);
  } else {
    const endpoint = exactMatch ? "produto.alterar.php" : "produto.incluir.php";
    const includeResult = await postTinyApi(endpoint, {
      token,
      produto: JSON.stringify(payload),
      formato: "JSON",
    });

    console.log(exactMatch ? "Update result:" : "Include result:");
    console.log(JSON.stringify(includeResult, null, 2));
    await upsertProductChannelMapping(pool, product, scxSku, supplierSku, includeResult);
  }
} finally {
  await pool.end();
}
