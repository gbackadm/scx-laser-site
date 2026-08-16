import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabasePool } from "@/domain/catalog/db";
import {
  buildGenericUserProductPayloads,
  deriveProfilePacks,
  inferMaterial,
  type AttributeMapping,
  type PublishingProfile,
} from "@/domain/mercadoLivre/genericPublishingCore.js";
import {
  buildPenUserProductPayloads,
  classifyOfferFinancials,
  classifyMercadoLivreValidation,
  derivePackOptions,
  publishingInputHash,
  validatePenSource,
  type PenPublishingSource,
} from "@/domain/mercadoLivre/publishingCore.js";
import {
  evaluateListingContent,
  extractYoutubeVideoId,
} from "@/domain/mercadoLivre/listingQuality.js";
import { confirmedMasterPack, confirmedUnitPack } from "@/domain/mercadoLivre/packageSource.js";
import {
  applyEditableAttributes,
  clearResolvedRequiredAttributeErrors,
  type EditableAttributeDefinition,
  type ListingAttribute,
} from "@/domain/mercadoLivre/draftAttributes.js";
import {
  createMercadoLivreDescription,
  createMercadoLivreItem,
  mercadoLivreRequest,
  uploadMercadoLivrePicture,
  validateMercadoLivreItem,
} from "@/domain/mercadoLivre/client";
import { getMercadoLivreConnection } from "@/domain/mercadoLivre/repository";
import {
  calculatePrice,
  getGlobalPricingRule,
  listGlobalPricingBatchTiers,
} from "@/domain/pricing/rules";

type MercadoLivrePictureDiagnostic = {
  source: string;
  pictureType: "thumbnail" | "other";
  status: "approved" | "issues" | "unavailable";
  issues: string[];
};

type MercadoLivreCategoryAttribute = {
  id: string;
  name?: string;
  value_type?: string;
  tags?: Record<string, boolean>;
  values?: Array<{ id?: string; name?: string }>;
  allowed_units?: Array<{ id?: string; name?: string }>;
};

export type MercadoLivreCategorySuggestion = {
  categoryId: string;
  categoryName: string;
  categoryPath: string[];
  domainId: string;
  domainName: string;
};

const categoryAttributesCache = new Map<string, { expiresAt: number; attributes: MercadoLivreCategoryAttribute[] }>();
const STANDARD_PACK_QUANTITIES = [10, 50, 100, 500, 1000];

async function getMercadoLivreCategoryAttributes(categoryId: string) {
  const cached = categoryAttributesCache.get(categoryId);
  if (cached && cached.expiresAt > Date.now()) return cached.attributes;
  const response = await mercadoLivreRequest<Array<MercadoLivreCategoryAttribute>>(`/categories/${categoryId}/attributes`);
  if (!response.ok || !Array.isArray(response.body)) throw new Error("Nao foi possivel consultar os atributos atuais da categoria Mercado Livre.");
  categoryAttributesCache.set(categoryId, { expiresAt: Date.now() + 60 * 60 * 1000, attributes: response.body });
  return response.body;
}

function editableAttributeDefinitions(attributes: MercadoLivreCategoryAttribute[], ids: Set<string>): EditableAttributeDefinition[] {
  return attributes
    .filter((item) => ids.has(item.id))
    .map((item) => ({
      id: item.id,
      name: String(item.name ?? item.id),
      required: true,
      scope: item.tags?.variation_attribute || item.tags?.defines_picture ? "variation" : "product",
      valueType: String(item.value_type ?? "string"),
      values: (item.values ?? []).flatMap((value) => value.name ? [{ id: value.id, name: value.name }] : []),
      allowedUnits: (item.allowed_units ?? []).flatMap((unit) => unit.id && unit.name ? [{ id: unit.id, name: unit.name }] : []),
    }));
}

function requiredAttributeDefinitions(attributes: MercadoLivreCategoryAttribute[]) {
  return editableAttributeDefinitions(
    attributes,
    new Set(attributes.filter((item) => item.tags?.required || item.tags?.new_required || item.tags?.catalog_required).map((item) => item.id)),
  );
}

async function persistAttributeDefinitions(productId: string, categoryId: string, definitions: EditableAttributeDefinition[]) {
  if (!definitions.length) return;
  const pool = getDatabasePool();
  for (const definition of definitions) {
    await pool.query(
      `INSERT INTO scx_mercado_livre_product_attributes (
         product_id, category_id, attribute_id, attribute_name, value_type,
         is_required, values_json, allowed_units_json, attribute_scope
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
       ON CONFLICT (product_id, category_id, attribute_id) DO UPDATE SET
         attribute_name=EXCLUDED.attribute_name,
         value_type=EXCLUDED.value_type,
         is_required=EXCLUDED.is_required,
         values_json=EXCLUDED.values_json,
         allowed_units_json=EXCLUDED.allowed_units_json,
         attribute_scope=EXCLUDED.attribute_scope,
         updated_at=now()`,
      [productId, categoryId, definition.id, definition.name, definition.valueType,
        definition.required, JSON.stringify(definition.values), JSON.stringify(definition.allowedUnits), definition.scope ?? "product"],
    );
  }
}

async function loadPersistedAttributes(productId: string, categoryId: string): Promise<ListingAttribute[]> {
  const result = await getDatabasePool().query(
    `SELECT attribute_id, value_id, value_name
       FROM scx_mercado_livre_product_attributes
      WHERE product_id=$1 AND category_id=$2 AND NULLIF(btrim(value_name),'') IS NOT NULL`,
    [productId, categoryId],
  );
  return result.rows.map((row) => ({
    id: String(row.attribute_id),
    ...(row.value_id ? { value_id: String(row.value_id) } : {}),
    value_name: String(row.value_name),
  }));
}

async function loadPersistedAttributeDefinitions(productId: string, categoryId: string): Promise<EditableAttributeDefinition[]> {
  const result = await getDatabasePool().query(
    `SELECT attribute_id, attribute_name, value_type, is_required, values_json, allowed_units_json, attribute_scope
       FROM scx_mercado_livre_product_attributes
      WHERE product_id=$1 AND category_id=$2`,
    [productId, categoryId],
  );
  return result.rows.map((row) => ({
    id: String(row.attribute_id),
    name: String(row.attribute_name),
    required: row.is_required === true,
    scope: row.attribute_scope === "variation" ? "variation" : "product",
    valueType: String(row.value_type),
    values: Array.isArray(row.values_json) ? row.values_json : [],
    allowedUnits: Array.isArray(row.allowed_units_json) ? row.allowed_units_json : [],
  }));
}

async function persistAttributeValues(productId: string, categoryId: string, payloads: MercadoLivreDraftPayload[]) {
  const values = new Map<string, ListingAttribute>();
  for (const payload of payloads) {
    const definitions = new Set((payload.editableAttributes ?? []).map((item) => item.id));
    const attributes = (payload.body as { attributes?: ListingAttribute[] }).attributes ?? [];
    for (const attribute of attributes) {
      if (definitions.has(attribute.id) && attribute.value_name?.trim()) values.set(attribute.id, attribute);
    }
  }
  const pool = getDatabasePool();
  for (const value of values.values()) {
    await pool.query(
      `UPDATE scx_mercado_livre_product_attributes
          SET value_id=$4, value_name=$5, source='manual', updated_at=now()
        WHERE product_id=$1 AND category_id=$2 AND attribute_id=$3`,
      [productId, categoryId, value.id, value.value_id ?? null, value.value_name ?? null],
    );
  }
}

function normalizedFactKey(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function inferredProductAttributes(input: {
  definitions: EditableAttributeDefinition[];
  product: Record<string, unknown>;
  productAttributes: Array<{ name?: string; slug?: string; value?: string }>;
  variants: Array<{ attributes: Record<string, string> }>;
}): ListingAttribute[] {
  const facts = new Map<string, string>();
  const add = (key: unknown, value: unknown) => {
    const normalizedKey = normalizedFactKey(key);
    const normalizedValue = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    if (normalizedKey && normalizedValue && !facts.has(normalizedKey)) facts.set(normalizedKey, normalizedValue);
  };
  for (const item of input.productAttributes) { add(item.name, item.value); add(item.slug, item.value); }
  const raw = (input.product.raw_payload ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) add(key, value);
  const properties = raw.propriedades && typeof raw.propriedades === "object" ? raw.propriedades as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(properties)) add(key, value);
  if (Array.isArray(raw.propriedades2)) for (const item of raw.propriedades2) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>; add(row.name, row.value); add(row.slug, row.value);
  }
  const variantKeys = new Set(input.variants.flatMap((variant) => Object.keys(variant.attributes ?? {})));
  for (const key of variantKeys) {
    const values = [...new Set(input.variants.map((variant) => String(variant.attributes?.[key] ?? "").trim()).filter(Boolean))];
    if (values.length === 1) add(key, values[0]);
  }
  const aliases: Record<string, string[]> = {
    BRAND: ["marca", "brand", "fabricante"],
    MODEL: ["modelo", "model", "referencia"],
    INK_COLOR: ["cor da tinta", "cor da escrita", "tinta", "ink color"],
    COLOR: ["cor", "color"],
    EXTERIOR_COLOR: ["cor", "cor externa", "exterior color"],
    MATERIALS: ["material", "materiais"],
    BOTTLE_MATERIAL: ["material", "materiais", "material da garrafa"],
    SPORT_BOTTLE_CAPACITY: ["capacidade", "capacidade da garrafa", "volume"],
    CUSTOMS_TARIFF_NUMBER: ["ncm"],
  };
  return input.definitions.flatMap((definition) => {
    const keys = [definition.id, definition.name, ...(aliases[definition.id] ?? [])].map(normalizedFactKey);
    let value = keys.map((key) => facts.get(key)).find(Boolean);
    if (!value && definition.id === "BRAND") value = "SCX Laser";
    if (!value && definition.id === "MODEL") value = String(input.product.external_id ?? input.product.sku ?? "").trim();
    if (!value && definition.id === "INK_COLOR") {
      const description = normalizedFactKey(input.product.description);
      const match = description.match(/(?:tinta|escrita) (azul|preta|vermelha|verde)/);
      if (match) value = match[1][0].toUpperCase() + match[1].slice(1);
    }
    if (!value && /(?:CAPACITY|VOLUME)/.test(definition.id)) {
      const searchable = `${String(input.product.title ?? "")} ${String(input.product.description ?? "")}`;
      const match = searchable.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|l)\b/i);
      if (match) value = `${match[1].replace(",", ".")} ${match[2].toLowerCase()}`;
    }
    if (!value && /MATERIAL/.test(definition.id)) {
      const searchable = normalizedFactKey(`${String(input.product.title ?? "")} ${String(input.product.description ?? "")}`);
      const supported = definition.values
        .filter((item) => normalizedFactKey(item.name).length >= 3)
        .sort((a, b) => b.name.length - a.name.length)
        .find((item) => searchable.includes(normalizedFactKey(item.name)));
      if (supported) value = supported.name;
      else value = inferMaterial(String(input.product.title ?? ""), String(input.product.description ?? "")) ?? undefined;
    }
    if (!value) return [];
    const option = definition.values.find((item) => normalizedFactKey(item.name) === normalizedFactKey(value));
    return [{ id: definition.id, ...(option?.id ? { value_id: option.id } : {}), value_name: option?.name ?? value }];
  });
}

async function persistInferredAttributeValues(productId: string, categoryId: string, values: ListingAttribute[]) {
  for (const value of values) {
    await getDatabasePool().query(
      `UPDATE scx_mercado_livre_product_attributes
          SET value_id=$4, value_name=$5, source='inferred', updated_at=now()
        WHERE product_id=$1 AND category_id=$2 AND attribute_id=$3
          AND (source <> 'manual' OR NULLIF(btrim(value_name),'') IS NULL)`,
      [productId, categoryId, value.id, value.value_id ?? null, value.value_name ?? null],
    );
  }
}

function missingRequiredAttributeIds(payload: MercadoLivreDraftPayload) {
  return new Set((payload.readinessErrors ?? []).flatMap((reason) => {
    const match = reason.match(/^Atributo obrigatorio ([A-Z0-9_]+) ausente\.$/);
    return match ? [match[1]] : [];
  }));
}

export type MercadoLivreDraftPayload = {
  offerId: string;
  variantId: string;
  sku: string;
  sourceVideoId?: string | null;
  color: string;
  unitsPerPack: number;
  unitPriceInCents: number;
  productCostInCents: number;
  description: string;
  selectedForPublishing?: boolean;
  editableAttributes?: EditableAttributeDefinition[];
  readinessErrors?: string[];
  contentReadiness?: {
    score: number;
    label: string;
    checks: Array<{ id: string; label: string; passed: boolean; blocking: boolean }>;
  };
  pictureDiagnostics?: MercadoLivrePictureDiagnostic[];
  publishable: boolean;
  financialStatus: "healthy" | "warning" | "blocked";
  fees?: {
    saleFeeInCents: number;
    shippingCostInCents: number;
    netRevenueInCents: number;
    contributionInCents: number;
    contributionPercentage: number;
    operationalCostInCents: number;
    taxReserveInCents: number;
    estimatedProfitInCents: number;
    returnPercentage: number;
    blockReasons: string[];
  };
  package: {
    unitsPerPack: number;
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
    confidence: "confirmed" | "estimated";
    warning: string | null;
  };
  body: Record<string, unknown>;
};

export type MercadoLivreMediaAsset = {
  id: string;
  url: string;
  owner: "product" | "variant";
  variantId: string | null;
  label: string;
};

export type MercadoLivreDraft = {
  productId: string;
  categoryId: string;
  domainId: string;
  familyName: string;
  description: string;
  status: string;
  payloads: MercadoLivreDraftPayload[];
  validationResults: unknown[];
  errorMessage: string | null;
  updatedAt: string;
  mediaLibrary: MercadoLivreMediaAsset[];
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isEditableContentError(reason: string) {
  return /foto|image|titulo comercial|descricao detalhada/i.test(reason);
}

function isEstimatedPackageError(reason: string) {
  return /embalagem.*estimad|kit \d+ ainda e estimad/i.test(reason);
}

function withPackageAttributes(attributes: ListingAttribute[], pack: MercadoLivreDraftPayload["package"]) {
  const packageIds = new Set(["SELLER_PACKAGE_HEIGHT", "SELLER_PACKAGE_WIDTH", "SELLER_PACKAGE_LENGTH", "SELLER_PACKAGE_WEIGHT"]);
  return [
    ...attributes.filter((item) => !packageIds.has(item.id)),
    { id: "SELLER_PACKAGE_HEIGHT", value_name: `${Math.ceil(pack.heightCm)} cm` },
    { id: "SELLER_PACKAGE_WIDTH", value_name: `${Math.ceil(pack.widthCm)} cm` },
    { id: "SELLER_PACKAGE_LENGTH", value_name: `${Math.ceil(pack.lengthCm)} cm` },
    { id: "SELLER_PACKAGE_WEIGHT", value_name: `${Math.ceil(pack.weightGrams)} g` },
  ];
}

function roundUpToEnding90(amountInCents: number) {
  const wholeReais = Math.floor(amountInCents / 100);
  let candidate = wholeReais * 100 + 90;
  if (candidate < amountInCents) candidate += 100;
  return candidate;
}

function buildGenericDescription(title: string, original: string, unitsPerPack: number, variation: string) {
  return [
    `Kit com ${unitsPerPack} unidade(s) de ${title}, na opcao ${variation}.`,
    "",
    original.trim(),
    "",
    "CONTEUDO DA EMBALAGEM",
    `${unitsPerPack} unidade(s) do produto na variacao selecionada.`,
    "",
    "INFORMACOES IMPORTANTES",
    "- Confira a variacao escolhida antes de finalizar a compra.",
    "- As medidas e demais caracteristicas tecnicas constam na ficha do anuncio.",
    "- A quantidade informada corresponde ao kit completo.",
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n");
}

type PictureDiagnosticResponse = {
  diagnostics?: Array<{
    picture_type?: string;
    detections?: Array<{ name?: string; wordings?: Array<{ value?: string }> }>;
  }>;
};

const pictureDiagnosticCache = new Map<string, {
  expiresAt: number;
  value: MercadoLivrePictureDiagnostic;
}>();

async function diagnosePicture(source: string, categoryId: string, title: string, pictureType: "thumbnail" | "other") {
  const key = `${categoryId}:${pictureType}:${title}:${source}`;
  const cached = pictureDiagnosticCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await mercadoLivreRequest<PictureDiagnosticResponse>("/moderations/pictures/diagnostic", {
    method: "POST",
    body: JSON.stringify({ picture_url: source, context: { category_id: categoryId, title, picture_type: pictureType } }),
  });
  const diagnostic = response.body?.diagnostics?.find((item) => item.picture_type === pictureType);
  const issues = (diagnostic?.detections ?? []).flatMap((detection) => {
    const wording = detection.wordings?.map((item) => String(item.value ?? "").trim()).find(Boolean);
    return wording || detection.name ? [wording ?? String(detection.name)] : [];
  });
  const value = {
    source,
    pictureType,
    status: (!response.ok || !diagnostic) ? "unavailable" as const : issues.length ? "issues" as const : "approved" as const,
    issues,
  };
  pictureDiagnosticCache.set(key, { expiresAt: Date.now() + 60 * 60 * 1000, value });
  return value;
}

type CategoryPredictionResponse = Array<{
  category_id?: string;
  category_name?: string;
  domain_id?: string;
  domain_name?: string;
}>;

type MercadoLivreCategoryDetails = {
  id?: string;
  name?: string;
  path_from_root?: Array<{ id?: string; name?: string }>;
  settings?: { listing_allowed?: boolean };
};

export async function searchMercadoLivreCategories(query: string): Promise<MercadoLivreCategorySuggestion[]> {
  const value = query.trim().replace(/\s+/g, " ");
  if (value.length < 4) throw new Error("Digite ao menos 4 caracteres para buscar categorias.");
  const connection = await getMercadoLivreConnection();
  if (!connection) throw new Error("Conecte a conta do Mercado Livre.");
  const response = await mercadoLivreRequest<CategoryPredictionResponse>(
    `/sites/${connection.siteId}/domain_discovery/search?limit=8&q=${encodeURIComponent(value)}`,
  );
  if (!response.ok || !Array.isArray(response.body)) throw new Error("O Mercado Livre nao retornou categorias agora.");
  const predictions = response.body.filter((item) => item.category_id && item.category_name && item.domain_id);
  const details = await Promise.all(predictions.map((item) =>
    mercadoLivreRequest<MercadoLivreCategoryDetails>(`/categories/${item.category_id}`)
  ));
  return predictions.flatMap((item, index) => {
    const detail = details[index];
    if (!detail.ok || detail.body?.settings?.listing_allowed === false) return [];
    const categoryPath = (detail.body?.path_from_root ?? []).flatMap((node) => node.name ? [String(node.name)] : []);
    return [{
      categoryId: String(item.category_id),
      categoryName: String(detail.body?.name ?? item.category_name),
      categoryPath: categoryPath.length ? categoryPath : [String(item.category_name)],
      domainId: String(item.domain_id),
      domainName: String(item.domain_name ?? item.category_name),
    }];
  });
}

export async function saveMercadoLivreProductCategory(input: {
  productId: string;
  query: string;
  categoryId: string;
  actorUserId: string;
}) {
  const product = await getDatabasePool().query(
    `SELECT id FROM scx_catalog_products WHERE id=$1 LIMIT 1`,
    [input.productId],
  );
  if (!product.rowCount) throw new Error("Produto nao encontrado.");
  const suggestions = await searchMercadoLivreCategories(input.query);
  const selected = suggestions.find((item) => item.categoryId === input.categoryId);
  if (!selected) throw new Error("Escolha uma categoria sugerida pelo Mercado Livre para este produto.");
  const details = await mercadoLivreRequest<{ settings?: { listing_allowed?: boolean } }>(`/categories/${selected.categoryId}`);
  if (!details.ok || details.body?.settings?.listing_allowed === false) throw new Error("Essa categoria nao aceita novas publicacoes.");
  const pool = getDatabasePool();
  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO scx_mercado_livre_product_settings (
         product_id, category_id, category_name, category_path, domain_id, domain_name, source, updated_by
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,'manual',$7)
       ON CONFLICT (product_id) DO UPDATE SET
         category_id=EXCLUDED.category_id,
         category_name=EXCLUDED.category_name,
         category_path=EXCLUDED.category_path,
         domain_id=EXCLUDED.domain_id,
         domain_name=EXCLUDED.domain_name,
         source='manual', updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [input.productId, selected.categoryId, selected.categoryName, JSON.stringify(selected.categoryPath), selected.domainId, selected.domainName, input.actorUserId],
    );
    await pool.query(`DELETE FROM scx_mercado_livre_product_drafts WHERE product_id=$1`, [input.productId]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
  return selected;
}

export async function listMercadoLivreCandidates() {
  const result = await getDatabasePool().query(
    `SELECT p.id, p.scx_sku, p.title, category.name AS category,
            COALESCE(
              (SELECT image.url FROM scx_catalog_product_images image WHERE image.product_id=p.id AND btrim(image.url) <> '' ORDER BY image.sort_order, image.id LIMIT 1),
              (SELECT image.url FROM scx_catalog_product_variant_images image
                INNER JOIN scx_catalog_product_variants image_variant ON image_variant.id=image.variant_id
                WHERE image_variant.product_id=p.id AND image_variant.is_active=true AND btrim(image.url) <> ''
                ORDER BY image_variant.sort_order, image.sort_order, image.id LIMIT 1)
            ) AS image_url,
            count(DISTINCT variant.id)::int AS variant_count,
            count(DISTINCT offer.id) FILTER (WHERE offer.external_id IS NOT NULL)::int AS published_variants,
            draft.status AS draft_status,
            CASE WHEN settings.product_id IS NOT NULL THEN 'reviewed' ELSE profile.status END AS profile_status,
            COALESCE(settings.category_id, profile.category_id) AS mercado_livre_category_id,
            settings.category_name AS mercado_livre_category_name,
            settings.category_path AS mercado_livre_category_path,
            (settings.product_id IS NOT NULL) AS has_category_override
       FROM scx_catalog_products p
       INNER JOIN scx_catalog_categories category ON category.id = p.category_id
       LEFT JOIN scx_catalog_product_variants variant
         ON variant.product_id = p.id AND variant.is_active = true
       LEFT JOIN scx_catalog_marketplace_offers offer
         ON offer.variant_id = variant.id AND offer.channel = 'mercado_livre'
       LEFT JOIN scx_mercado_livre_product_drafts draft ON draft.product_id = p.id
       LEFT JOIN scx_mercado_livre_category_profiles profile ON profile.catalog_category_id = p.category_id
       LEFT JOIN scx_mercado_livre_product_settings settings ON settings.product_id = p.id
      GROUP BY p.id, category.name, draft.status, profile.status, profile.category_id,
               settings.product_id, settings.category_id, settings.category_name, settings.category_path
      ORDER BY CASE WHEN settings.product_id IS NOT NULL OR profile.status = 'reviewed' THEN 0 ELSE 1 END, category.name, p.title
      `,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    scxSku: String(row.scx_sku),
    title: String(row.title),
    category: String(row.category),
    imageUrl: row.image_url ? String(row.image_url) : null,
    variantCount: Number(row.variant_count),
    publishedVariants: Number(row.published_variants),
    draftStatus: row.draft_status ? String(row.draft_status) : null,
    profileStatus: row.profile_status ? String(row.profile_status) : "unreviewed",
    mercadoLivreCategoryId: row.mercado_livre_category_id ? String(row.mercado_livre_category_id) : null,
    mercadoLivreCategoryName: row.mercado_livre_category_name ? String(row.mercado_livre_category_name) : null,
    mercadoLivreCategoryPath: Array.isArray(row.mercado_livre_category_path) ? row.mercado_livre_category_path.map(String) : [],
    hasCategoryOverride: row.has_category_override === true,
  }));
}

async function getPublishingData(productId: string) {
  const pool = getDatabasePool();
  const [productResult, variantResult, imageResult, pricingRule, pricingTiers, profileResult, productAttributeResult] = await Promise.all([
    pool.query(
      `SELECT p.id, p.sku, p.scx_sku, p.title, p.description, p.category_id, p.price_amount_in_cents,
              p.stock_quantity, category.name AS category, sp.external_id,
              sp.raw_payload
         FROM scx_catalog_products p
         INNER JOIN scx_catalog_categories category ON category.id = p.category_id
         LEFT JOIN scx_catalog_supplier_products sp ON sp.id = p.supplier_product_id
        WHERE p.id = $1 LIMIT 1`,
      [productId],
    ),
    pool.query(
      `SELECT variant.id, variant.scx_sku, variant.price_amount_in_cents,
              variant.cost_amount_in_cents,
              variant.stock_quantity, variant.attributes,
              COALESCE(array_agg(image.url ORDER BY image.sort_order, image.id)
                FILTER (WHERE image.id IS NOT NULL), '{}'::text[]) AS images
         FROM scx_catalog_product_variants variant
         LEFT JOIN scx_catalog_product_variant_images image ON image.variant_id = variant.id
        WHERE variant.product_id = $1 AND variant.is_active = true
        GROUP BY variant.id
        ORDER BY variant.sort_order, variant.id`,
      [productId],
    ),
    pool.query(
      `SELECT url FROM scx_catalog_product_images WHERE product_id = $1
        AND btrim(url) <> '' ORDER BY sort_order, id`,
      [productId],
    ),
    getGlobalPricingRule(),
    listGlobalPricingBatchTiers(),
    pool.query(`SELECT profile.*,
        settings.category_id AS override_category_id,
        settings.category_name AS override_category_name,
        settings.domain_id AS override_domain_id
      FROM scx_catalog_products product
      LEFT JOIN scx_mercado_livre_category_profiles profile ON profile.catalog_category_id=product.category_id
      LEFT JOIN scx_mercado_livre_product_settings settings ON settings.product_id=product.id
      WHERE product.id=$1 LIMIT 1`, [productId]),
    pool.query(`SELECT name, slug, value FROM scx_catalog_product_attributes
      WHERE product_id=$1 AND is_channel_attribute=true ORDER BY sort_order, id`, [productId]),
  ]);
  const product = productResult.rows[0];
  if (!product) throw new Error("Produto nao encontrado.");
  const storedProfile = profileResult.rows[0];
  const hasOverride = Boolean(storedProfile?.override_category_id);
  if ((!storedProfile || storedProfile.status !== "reviewed") && !hasOverride) {
    throw new Error(`Escolha uma categoria Mercado Livre para ${product.category} antes de gerar a previa.`);
  }
  const profile = {
    ...storedProfile,
    status: "reviewed",
    adapter: storedProfile?.adapter ?? "generic",
    category_id: storedProfile?.override_category_id ?? storedProfile?.category_id,
    domain_id: storedProfile?.override_domain_id ?? storedProfile?.domain_id,
    category_name: storedProfile?.override_category_name ?? null,
    variation_axes: storedProfile?.variation_axes ?? [],
    pack_quantities: storedProfile?.pack_quantities ?? [],
    attribute_mapping: storedProfile?.attribute_mapping ?? [],
  };
  const master = confirmedMasterPack(product.raw_payload);
  const desiredQuantities = STANDARD_PACK_QUANTITIES;
  const genericPacks = deriveProfilePacks({
    desiredQuantities,
    masterPack: { unitsPerPack: master.masterUnits, heightCm: master.heightCm, widthCm: master.widthCm, lengthCm: master.lengthCm, weightGrams: master.weightGrams },
    unit: confirmedUnitPack(product.raw_payload),
  });
  const usesPenPilot = false;
  const packs = usesPenPilot ? derivePackOptions(master) : genericPacks.packs.map((pack) => ({ ...pack, warning: pack.warning ?? null }));
  if (!packs.length) throw new Error(genericPacks.errors.map((item) => item.message).join(" ") || "Produto sem embalagem comercial utilizavel.");
  const variants = variantResult.rows.map((row) => ({
      id: String(row.id),
      scxSku: String(row.scx_sku),
      sku: String(row.scx_sku),
      offerPricesInCents: Object.fromEntries(packs.map((pack) => {
        const tier = [...pricingTiers]
          .filter((item) => item.minQuantity <= pack.unitsPerPack)
          .sort((a, b) => b.minQuantity - a.minQuantity)[0];
        return [String(pack.unitsPerPack), calculatePrice({
          costAmountInCents: Number(row.cost_amount_in_cents),
          quantity: pack.unitsPerPack,
          rule: pricingRule,
          tier,
        }).roundedAmountInCents];
      })),
      costInCents: Number(row.cost_amount_in_cents),
      stockQuantity: Number(row.stock_quantity),
      attributes: row.attributes ?? {},
      images: (row.images ?? []).map(String),
    }));
  const images = imageResult.rows.map((row) => String(row.url));
  return { product, profile, packs, variants, images, pricingRule, productAttributes: productAttributeResult.rows, genericPackErrors: genericPacks.errors };
}

export async function generateMercadoLivreDraft(productId: string, actorUserId: string) {
  const { product, profile, packs, variants, images, pricingRule, productAttributes, genericPackErrors } = await getPublishingData(productId);
  const usesPenPilot = false;
  const connection = await getMercadoLivreConnection();
  if (!connection) throw new Error("Conecte a conta do Mercado Livre antes de gerar a previa.");
  let generated: { familyName: string; description: string; payloads: MercadoLivreDraftPayload[] };
  let source: PenPublishingSource | Record<string, unknown>;
  const rawPayload = (product.raw_payload ?? {}) as Record<string, unknown>;
  const videoId = extractYoutubeVideoId(rawPayload.video);
  if (usesPenPilot) {
    const penSource: PenPublishingSource = { supplierCode: String(product.external_id ?? product.sku), images, videoId, packs, variants };
    source = penSource;
    const errors = validatePenSource(penSource);
    if (errors.length) throw new Error(errors.join(" "));
    generated = buildPenUserProductPayloads(penSource);
  } else {
    const [categoryAttributes, categoryDetailsResponse] = await Promise.all([
      getMercadoLivreCategoryAttributes(profile.category_id),
      mercadoLivreRequest<{ settings?: { max_pictures_per_item?: number } }>(`/categories/${profile.category_id}`),
    ]);
    if (!categoryDetailsResponse.ok) {
      throw new Error("Nao foi possivel consultar as regras atuais da categoria Mercado Livre.");
    }
    const normalizedProduct = {
      id: String(product.id),
      title: String(product.title),
      description: String(product.description ?? ""),
      supplierCode: String(product.external_id ?? product.sku),
      sku: String(product.scx_sku),
      stockQuantity: Number(product.stock_quantity),
      images,
      videoId,
      offerPricesInCents: {},
      variants: variants.map((variant) => ({ ...variant, offerPricesInCents: variant.offerPricesInCents })),
    };
    const storedDefinitions = await loadPersistedAttributeDefinitions(productId, profile.category_id);
    const categoryIds = new Set([...categoryAttributes.map((item) => item.id), ...storedDefinitions.map((item) => item.id)]);
    const configuredMappings = (Array.isArray(profile.attribute_mapping) ? profile.attribute_mapping : [])
      .filter((mapping: AttributeMapping) => categoryIds.has(mapping.targetId)) as AttributeMapping[];
    const colorTarget = categoryAttributes.find((item) => item.tags?.defines_picture)
      ?? categoryAttributes.find((item) => ["COLOR", "EXTERIOR_COLOR"].includes(item.id));
    const automaticMappings: AttributeMapping[] = [
      ...(categoryIds.has("MODEL") ? [{ targetId: "MODEL", source: "supplierCode" } as AttributeMapping] : []),
      ...(categoryIds.has("MATERIALS") ? [{ targetId: "MATERIALS", source: "inferredMaterial" } as AttributeMapping] : []),
      ...(colorTarget ? [{ targetId: colorTarget.id, source: "variantAttribute", sourceKey: "Cor" } as AttributeMapping] : []),
    ];
    const attributeMappings = [...configuredMappings];
    for (const mapping of automaticMappings) {
      if (!attributeMappings.some((item) => item.targetId === mapping.targetId)) attributeMappings.push(mapping);
    }
    const configuredAxes = (profile.variation_axes ?? []) as string[];
    const requestedAxes = configuredAxes.length
      ? configuredAxes
      : colorTarget && variants.some((variant) => Boolean(variant.attributes?.Cor)) ? ["Cor"] : [];
    const variationAxes = requestedAxes.filter((axis) => attributeMappings.some((mapping) =>
      mapping.source === "variantAttribute" && mapping.sourceKey === axis
      && Boolean(categoryAttributes.find((item) => item.id === mapping.targetId)?.tags?.allow_variations
        || categoryAttributes.find((item) => item.id === mapping.targetId)?.tags?.variation_attribute
        || categoryAttributes.find((item) => item.id === mapping.targetId)?.tags?.defines_picture)
    ));
    const normalizedProfile: PublishingProfile = {
      status: profile.status,
      categoryId: profile.category_id,
      domainId: profile.domain_id,
      familyName: String(product.title),
      maxPictures: Number(categoryDetailsResponse.body?.settings?.max_pictures_per_item ?? 12),
      variationAxes,
      packQuantities: packs.map((pack) => pack.unitsPerPack),
      attributeMappings,
    };
    const variationTargetIds = new Set(attributeMappings
      .filter((mapping) => mapping.source === "variantAttribute" && variationAxes.includes(mapping.sourceKey ?? ""))
      .map((mapping) => mapping.targetId));
    const discoveredDefinitions = requiredAttributeDefinitions(categoryAttributes).map((definition) => ({
      ...definition,
      scope: variationTargetIds.has(definition.id) ? "variation" as const : "product" as const,
    }));
    await persistAttributeDefinitions(productId, profile.category_id, discoveredDefinitions);
    const requiredDefinitions = [...new Map(
      [...storedDefinitions, ...discoveredDefinitions].filter((item) => item.required).map((item) => [item.id, item])
    ).values()];
    const inferredAttributes = inferredProductAttributes({
      definitions: requiredDefinitions,
      product,
      productAttributes,
      variants,
    });
    await persistInferredAttributeValues(productId, profile.category_id, inferredAttributes);
    const persistedAttributes = await loadPersistedAttributes(productId, profile.category_id);
    const generic = buildGenericUserProductPayloads({ product: normalizedProduct, profile: normalizedProfile, categoryAttributes, packages: packs });
    const byVariant = new Map(variants.map((variant) => [variant.id, variant]));
    generated = {
      familyName: String(product.title),
      description: String(product.description ?? ""),
      payloads: generic.payloads.map((payload) => {
        const variant = byVariant.get(payload.variantId)!;
        const priceInCents = variant.offerPricesInCents[String(payload.unitsPerPack)];
        const missingAttributeIds = new Set(payload.errors
          .filter((item) => item.code === "REQUIRED_ATTRIBUTE_MISSING" && item.attributeId)
          .map((item) => item.attributeId));
        const editableAttributes = requiredDefinitions.filter((item) =>
          missingAttributeIds.has(item.id)
          || persistedAttributes.some((value) => value.id === item.id)
          || storedDefinitions.some((value) => value.id === item.id)
        );
        const attributeResult = applyEditableAttributes({
          existing: ((payload.body as { attributes?: ListingAttribute[] }).attributes ?? []),
          submitted: persistedAttributes,
          definitions: requiredDefinitions,
        });
        const readinessErrors = clearResolvedRequiredAttributeErrors(
          [...payload.errors.map((item) => item.message), ...genericPackErrors.map((item) => item.message)],
          attributeResult.attributes,
        );
        return {
          ...payload,
          editableAttributes,
          package: { ...payload.package, warning: payload.package.warning ?? null },
          color: payload.variationIdentity,
          unitPriceInCents: Math.round(priceInCents / payload.unitsPerPack),
          productCostInCents: variant.costInCents * payload.unitsPerPack,
          description: buildGenericDescription(
            String(product.title),
            String(product.description ?? ""),
            payload.unitsPerPack,
            payload.variationIdentity,
          ),
          body: { ...payload.body, attributes: attributeResult.attributes },
          financialStatus: payload.publishable ? "healthy" as const : "blocked" as const,
          readinessErrors,
        };
      }),
    };
    source = { normalizedProduct, normalizedProfile, packs };
  }
  const savedPackages = await getDatabasePool().query(
    `SELECT variant_id, units_per_pack, package_height_cm, package_width_cm,
            package_length_cm, package_weight_grams, package_confidence
       FROM scx_catalog_marketplace_offers
      WHERE product_id=$1 AND channel='mercado_livre' AND package_confidence='confirmed'`,
    [productId],
  );
  const packagesByOffer = new Map(savedPackages.rows.map((row) => [
    `${row.variant_id}:${row.units_per_pack}`,
    {
      heightCm: Number(row.package_height_cm), widthCm: Number(row.package_width_cm),
      lengthCm: Number(row.package_length_cm), weightGrams: Number(row.package_weight_grams),
    },
  ]));
  for (const payload of generated.payloads) {
    const body = payload.body as { pictures?: Array<{ source?: string }> };
    const variant = variants.find((item) => item.id === payload.variantId);
    const savedPackage = packagesByOffer.get(`${payload.variantId}:${payload.unitsPerPack}`);
    if (savedPackage) {
      payload.package = { ...payload.package, ...savedPackage, confidence: "confirmed", warning: null };
      const attributes = (payload.body as { attributes?: ListingAttribute[] }).attributes ?? [];
      (payload.body as { attributes: ListingAttribute[] }).attributes = withPackageAttributes(attributes, payload.package);
      payload.readinessErrors = (payload.readinessErrors ?? []).filter((reason) => !isEstimatedPackageError(reason));
    }
    const orderedSources = [...new Set([
      ...(variant?.images ?? []),
      images[0],
    ].filter(Boolean) as string[])].slice(0, 12);
    body.pictures = orderedSources.map((source) => ({ source }));
    payload.readinessErrors = (payload.readinessErrors ?? []).filter((reason) => !isEditableContentError(reason));
    payload.selectedForPublishing = Number((body as { available_quantity?: number }).available_quantity ?? 0) > 0;
  }
  const diagnosticRequests = new Map<string, { source: string; categoryId: string; title: string; pictureType: "thumbnail" | "other" }>();
  for (const payload of generated.payloads) {
    const body = payload.body as { category_id?: string; family_name?: string; pictures?: Array<{ source?: string }> };
    for (const [index, picture] of (body.pictures ?? []).entries()) {
      if (!picture.source) continue;
      const pictureType = index === 0 ? "thumbnail" as const : "other" as const;
      const request = { source: picture.source, categoryId: String(body.category_id ?? profile.category_id), title: String(body.family_name ?? generated.familyName), pictureType };
      diagnosticRequests.set(`${request.categoryId}:${pictureType}:${request.source}`, request);
    }
  }
  const diagnosticsByKey = new Map<string, Awaited<ReturnType<typeof diagnosePicture>>>();
  const requests = [...diagnosticRequests.values()];
  for (let offset = 0; offset < requests.length; offset += 4) {
    const batch = requests.slice(offset, offset + 4);
    const results = await Promise.all(batch.map((request) => diagnosePicture(request.source, request.categoryId, request.title, request.pictureType)));
    results.forEach((diagnostic) => diagnosticsByKey.set(`${profile.category_id}:${diagnostic.pictureType}:${diagnostic.source}`, diagnostic));
  }
  const costCache = new Map<string, Promise<{ saleFeeInCents: number; shippingCostInCents: number; calculationError?: string }>>();
  for (const payload of generated.payloads) {
      const body = payload.body as {
        price: number;
        listing_type_id: string;
        category_id: string;
        family_name?: string;
        pictures?: Array<{ source?: string }>;
        attributes?: Array<unknown>;
      };
      payload.pictureDiagnostics = (body.pictures ?? []).map((picture, index) => {
        const pictureType = index === 0 ? "thumbnail" as const : "other" as const;
        return diagnosticsByKey.get(`${body.category_id}:${pictureType}:${picture.source}`) ?? {
          source: String(picture.source ?? ""), pictureType, status: "unavailable" as const, issues: [],
        };
      });
      const mainPictureDiagnostic = payload.pictureDiagnostics[0];
      payload.contentReadiness = evaluateListingContent({
        familyName: body.family_name,
        pictures: body.pictures,
        videoId: null,
        description: payload.description,
        attributes: body.attributes,
        mainPictureAccepted: mainPictureDiagnostic?.status === "unavailable" ? null : mainPictureDiagnostic?.status === "approved",
      });
      if (mainPictureDiagnostic?.status === "issues") {
        payload.readinessErrors ??= [];
        payload.readinessErrors.push(`Foto principal reprovada pelo diagnostico Mercado Livre: ${mainPictureDiagnostic.issues.join(" ")}`);
      }
      for (const check of payload.contentReadiness.checks.filter((item) => item.blocking && !item.passed)) {
        const reason = `${check.label}: corrija antes de publicar.`;
        payload.readinessErrors ??= [];
        if (!payload.readinessErrors.includes(reason)) payload.readinessErrors.push(reason);
      }
      const pack = payload.package;
      const dimensions = `${Math.ceil(pack.heightCm)}x${Math.ceil(pack.widthCm)}x${Math.ceil(pack.lengthCm)},${Math.ceil(pack.weightGrams)}`;
      const getCosts = (price: number) => {
        const costKey = `${body.category_id}:${body.listing_type_id}:${price}:${dimensions}`;
        if (!costCache.has(costKey)) costCache.set(costKey, (async () => {
          const feeQuery = new URLSearchParams({ price: String(price), listing_type_id: body.listing_type_id, category_id: body.category_id, currency_id: "BRL", logistic_type: "drop_off" });
          const shippingQuery = new URLSearchParams({ dimensions, verbose: "true", item_price: String(price), listing_type_id: body.listing_type_id, mode: "me2", condition: "new", logistic_type: "drop_off", free_shipping: "true" });
          const [feeResponse, shippingResponse] = await Promise.all([
            mercadoLivreRequest<{ sale_fee_amount?: number }>(`/sites/${connection.siteId}/listing_prices?${feeQuery}`),
            mercadoLivreRequest<{ coverage?: { all_country?: { list_cost?: number } } }>(`/users/${connection.userId}/shipping_options/free?${shippingQuery}`),
          ]);
          return {
            saleFeeInCents: Math.round(Number(feeResponse.body?.sale_fee_amount ?? 0) * 100),
            shippingCostInCents: Math.round(Number(shippingResponse.body?.coverage?.all_country?.list_cost ?? 0) * 100),
            ...(!feeResponse.ok || !shippingResponse.ok ? { calculationError: `Custos logisticos do kit ${pack.unitsPerPack} indisponiveis; revise a embalagem.` } : {}),
          };
        })());
        return costCache.get(costKey)!;
      };
      let priceInCents = Math.round(Number(body.price) * 100);
      let costs = await getCosts(body.price);
      const classify = () => classifyOfferFinancials({
          priceInCents,
          saleFeeInCents: costs.saleFeeInCents,
          shippingCostInCents: costs.shippingCostInCents,
          productCostInCents: payload.productCostInCents,
          operationalCostInCents: pricingRule.marketplaceOperationalCostAmountInCents,
          taxReservePercentage: pricingRule.marketplaceTaxReservePercentage,
          minProfitInCents: pricingRule.marketplaceMinProfitAmountInCents,
          minReturnPercentage: pricingRule.marketplaceMinReturnPercentage,
          maxProductCostInCents: pricingRule.marketplaceMaxProductCostAmountInCents,
        });
      let financials = classify();
      for (let attempt = 0; attempt < 3 && !costs.calculationError
        && financials.blockReasons.some((reason) => /Resultado estimado|Retorno sobre o custo/.test(reason)); attempt += 1) {
        const requiredProfit = Math.max(
          pricingRule.marketplaceMinProfitAmountInCents,
          Math.ceil(payload.productCostInCents * pricingRule.marketplaceMinReturnPercentage / 100),
        );
        const feeRate = priceInCents > 0 ? costs.saleFeeInCents / priceInCents : 0;
        const taxRate = pricingRule.marketplaceTaxReservePercentage / 100;
        const denominator = Math.max(0.01, 1 - feeRate - taxRate);
        const requiredPrice = (
          payload.productCostInCents + costs.shippingCostInCents
          + pricingRule.marketplaceOperationalCostAmountInCents + requiredProfit
        ) / denominator;
        const nextPrice = roundUpToEnding90(Math.max(requiredPrice, priceInCents + 100));
        priceInCents = nextPrice;
        body.price = nextPrice / 100;
        payload.unitPriceInCents = Math.ceil(nextPrice / payload.unitsPerPack);
        costs = await getCosts(body.price);
        financials = classify();
      }
      if (payload.package.confidence !== "confirmed") {
        financials.blockReasons.push("Embalagem estimada: confirme medidas e peso antes de publicar.");
        financials.publishable = false;
        financials.financialStatus = "blocked";
      }
      if (costs.calculationError) financials.blockReasons.push(costs.calculationError);
      for (const readinessError of payload.readinessErrors ?? []) {
        if (!financials.blockReasons.includes(readinessError)) financials.blockReasons.push(readinessError);
      }
      if (financials.blockReasons.length) {
        financials.publishable = false;
        financials.financialStatus = "blocked";
      }
      payload.fees = financials;
      payload.publishable = financials.publishable;
      payload.financialStatus = financials.financialStatus;
  }
  const inputHash = publishingInputHash({ source, rawPayload: product.raw_payload });
  await Promise.all(generated.payloads.map((payload) => getDatabasePool().query(
    `INSERT INTO scx_catalog_marketplace_offers (
       id, product_id, variant_id, channel, units_per_pack,
       package_height_cm, package_width_cm, package_length_cm,
       package_weight_grams, package_confidence, package_warning, external_sku
     ) VALUES ($1,$2,$3,'mercado_livre',$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (variant_id, channel, units_per_pack) DO UPDATE SET
       package_height_cm=EXCLUDED.package_height_cm,
       package_width_cm=EXCLUDED.package_width_cm,
       package_length_cm=EXCLUDED.package_length_cm,
       package_weight_grams=EXCLUDED.package_weight_grams,
       package_confidence=EXCLUDED.package_confidence,
       package_warning=EXCLUDED.package_warning,
       external_sku=EXCLUDED.external_sku,
       updated_at=now()`,
    [payload.offerId, productId, payload.variantId, payload.unitsPerPack,
      payload.package.heightCm, payload.package.widthCm, payload.package.lengthCm,
      payload.package.weightGrams, payload.package.confidence, payload.package.warning, payload.sku],
  )));
  await getDatabasePool().query(
    `INSERT INTO scx_mercado_livre_product_drafts (
       id, product_id, category_id, domain_id, family_name, description,
       content_source, input_hash, payloads, status, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,'rules',$7,$8::jsonb,'draft',$9)
     ON CONFLICT (product_id) DO UPDATE SET
       category_id = EXCLUDED.category_id,
       domain_id = EXCLUDED.domain_id,
       family_name = EXCLUDED.family_name,
       description = EXCLUDED.description,
       input_hash = EXCLUDED.input_hash,
       payloads = EXCLUDED.payloads,
       validation_results = '[]'::jsonb,
       status = 'draft',
       error_message = NULL,
       created_by = EXCLUDED.created_by,
       updated_at = now()`,
    [randomUUID(), productId, profile.category_id, profile.domain_id, generated.familyName, generated.description, inputHash, JSON.stringify(generated.payloads), actorUserId],
  );
  return getMercadoLivreDraft(productId);
}

export async function listMercadoLivreMediaLibrary(productId: string): Promise<MercadoLivreMediaAsset[]> {
  const result = await getDatabasePool().query(
    `SELECT image.id, image.url, 'product' AS owner, NULL::text AS variant_id,
            'Produto pai' AS label, image.sort_order
       FROM scx_catalog_product_images image
      WHERE image.product_id=$1 AND btrim(image.url) <> ''
      UNION ALL
     SELECT image.id, image.url, 'variant' AS owner, variant.id AS variant_id,
            COALESCE(NULLIF(variant.attributes->>'Cor',''), NULLIF(variant.attributes->>'cor',''), variant.scx_sku) AS label,
            image.sort_order
       FROM scx_catalog_product_variant_images image
       INNER JOIN scx_catalog_product_variants variant ON variant.id=image.variant_id
      WHERE variant.product_id=$1 AND variant.is_active=true AND btrim(image.url) <> ''
      ORDER BY owner, sort_order, id`,
    [productId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    url: String(row.url),
    owner: row.owner === "variant" ? "variant" as const : "product" as const,
    variantId: row.variant_id ? String(row.variant_id) : null,
    label: String(row.label),
  }));
}

export async function uploadMercadoLivreCatalogImage(productId: string, variantId: string | null, file: File) {
  if (!file.type.startsWith("image/") || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("A imagem deve ter no maximo 10 MB.");
  if (variantId) {
    const variant = await getDatabasePool().query(
      `SELECT id FROM scx_catalog_product_variants WHERE id=$1 AND product_id=$2 AND is_active=true LIMIT 1`,
      [variantId, productId],
    );
    if (!variant.rowCount) throw new Error("A variacao escolhida nao pertence a este produto.");
  }
  const uploaded = await uploadMercadoLivrePicture(file);
  if (!uploaded.ok || !uploaded.body?.id) throw new Error(`Mercado Livre recusou a imagem (${uploaded.status}).`);
  const best = [...(uploaded.body.variations ?? [])].sort((a, b) => {
    const area = (value?: string) => (value?.split("x").map(Number).reduce((x, y) => x * y, 1) ?? 0);
    return area(b.size) - area(a.size);
  })[0];
  const url = best?.secure_url ?? best?.url;
  if (!url) throw new Error("O Mercado Livre recebeu a imagem, mas nao devolveu uma URL utilizavel.");
  const pool = getDatabasePool();
  if (variantId) {
    await pool.query(
      `INSERT INTO scx_catalog_product_variant_images (id, variant_id, url, alt_text, sort_order)
       SELECT $1,$2,$3,$4,COALESCE(MAX(sort_order),-1)+1 FROM scx_catalog_product_variant_images WHERE variant_id=$2`,
      [randomUUID(), variantId, url, file.name],
    );
  } else {
    await pool.query(
      `INSERT INTO scx_catalog_product_images (id, product_id, url, alt_text, source, sort_order)
       SELECT $1,$2,$3,$4,'curated',COALESCE(MAX(sort_order),-1)+1 FROM scx_catalog_product_images WHERE product_id=$2`,
      [randomUUID(), productId, url, file.name],
    );
  }
  await pool.query(`UPDATE scx_catalog_products SET updated_at=now() WHERE id=$1`, [productId]);
  return { pictureId: uploaded.body.id, url, mediaLibrary: await listMercadoLivreMediaLibrary(productId) };
}

export async function getMercadoLivreDraft(productId: string): Promise<MercadoLivreDraft | null> {
  const result = await getDatabasePool().query(
    `SELECT * FROM scx_mercado_livre_product_drafts WHERE product_id = $1 LIMIT 1`,
    [productId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const payloads = (row.payloads ?? []) as MercadoLivreDraftPayload[];
  const legacyMissingIds = new Set(payloads.flatMap((payload) =>
    payload.editableAttributes?.length ? [] : [...missingRequiredAttributeIds(payload)]
  ));
  if (legacyMissingIds.size) {
    const definitions = editableAttributeDefinitions(
      await getMercadoLivreCategoryAttributes(String(row.category_id)),
      legacyMissingIds,
    );
    await persistAttributeDefinitions(productId, String(row.category_id), definitions);
    const persisted = await loadPersistedAttributes(productId, String(row.category_id));
    for (const payload of payloads) {
      if (!payload.editableAttributes?.length) {
        const ids = missingRequiredAttributeIds(payload);
        payload.editableAttributes = definitions.filter((item) => ids.has(item.id));
        const body = payload.body as { attributes?: ListingAttribute[] };
        const applied = applyEditableAttributes({ existing: body.attributes ?? [], submitted: persisted, definitions });
        body.attributes = applied.attributes;
        payload.readinessErrors = clearResolvedRequiredAttributeErrors(payload.readinessErrors, applied.attributes);
      }
    }
  }
  return {
    productId: String(row.product_id),
    categoryId: String(row.category_id),
    domainId: String(row.domain_id),
    familyName: String(row.family_name),
    description: String(row.description),
    status: String(row.status),
    payloads,
    validationResults: row.validation_results ?? [],
    errorMessage: row.error_message ? String(row.error_message) : null,
    updatedAt: iso(row.updated_at),
    mediaLibrary: await listMercadoLivreMediaLibrary(productId),
  } satisfies MercadoLivreDraft;
}

type DraftOfferEdit = {
  offerId: string;
  selected: boolean;
  price: number;
  pictureSources: string[];
  attributes: ListingAttribute[];
  package: {
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
    confirmed: boolean;
  };
};

export async function editMercadoLivreDraft(input: {
  productId: string;
  unitsPerPack: number;
  familyName: string;
  description: string;
  listingTypeId: "gold_special" | "gold_pro";
  offers: DraftOfferEdit[];
}) {
  const draft = await getMercadoLivreDraft(input.productId);
  if (!draft) throw new Error("Gere a previa antes de editar.");
  const familyName = input.familyName.trim().replace(/\s+/g, " ");
  const description = input.description.trim();
  if (familyName.length < 15 || familyName.length > 60) throw new Error("O titulo deve ter entre 15 e 60 caracteres.");
  if (description.length < 80 || description.length > 5000) throw new Error("A descricao deve ter entre 80 e 5.000 caracteres.");
  if (!["gold_special", "gold_pro"].includes(input.listingTypeId)) throw new Error("Modalidade de anuncio invalida.");
  const family = draft.payloads.filter((payload) =>
    payload.unitsPerPack === input.unitsPerPack
    && Number((payload.body as { available_quantity?: number }).available_quantity ?? 0) > 0
  );
  if (!family.length) throw new Error("O tamanho de kit escolhido nao existe.");
  const edits = new Map(input.offers.map((item) => [item.offerId, item]));
  if (family.some((payload) => !edits.has(payload.offerId))) throw new Error("As opcoes de variacao chegaram incompletas.");
  if (![...edits.values()].some((item) => item.selected)) throw new Error("Selecione ao menos uma variacao.");
  const mediaLibrary = await listMercadoLivreMediaLibrary(input.productId);
  const allowedPictures = new Set(mediaLibrary.map((item) => item.url));
  const connection = await getMercadoLivreConnection();
  if (!connection) throw new Error("Conecte a conta do Mercado Livre.");
  const pricingRule = await getGlobalPricingRule();
  const payloads = draft.payloads.map((payload) => {
    if (payload.unitsPerPack !== input.unitsPerPack) return payload;
    if (Number((payload.body as { available_quantity?: number }).available_quantity ?? 0) < 1) {
      return { ...payload, selectedForPublishing: false };
    }
    const edit = edits.get(payload.offerId)!;
    const pictureSources = [...new Set(edit.pictureSources.map((item) => item.trim()).filter(Boolean))];
    if (edit.selected && (pictureSources.length < 2 || pictureSources.length > 12)) throw new Error(`${payload.color}: selecione de 2 a 12 fotos.`);
    if (pictureSources.some((url) => !allowedPictures.has(url))) throw new Error(`${payload.color}: a selecao contem uma foto fora da biblioteca do produto.`);
    if (!Number.isFinite(edit.price) || edit.price <= 0) throw new Error(`${payload.color}: informe um preco valido.`);
    const packageValues = [edit.package.heightCm, edit.package.widthCm, edit.package.lengthCm, edit.package.weightGrams];
    if (edit.selected && packageValues.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error(`${payload.color}: informe dimensoes e peso validos para a embalagem.`);
    }
    const nextPackage = {
      ...payload.package,
      heightCm: edit.package.heightCm,
      widthCm: edit.package.widthCm,
      lengthCm: edit.package.lengthCm,
      weightGrams: Math.ceil(edit.package.weightGrams),
      confidence: edit.package.confirmed ? "confirmed" as const : "estimated" as const,
      warning: edit.package.confirmed ? null : "Embalagem ainda precisa ser confirmada antes de publicar.",
    };
    const currentAttributes = ((payload.body as { attributes?: ListingAttribute[] }).attributes ?? []);
    const attributeResult = applyEditableAttributes({
      existing: currentAttributes,
      submitted: edit.attributes,
      definitions: payload.editableAttributes ?? [],
    });
    if (edit.selected && attributeResult.missing.length) {
      throw new Error(`${payload.color}: preencha ${attributeResult.missing.map((item) => item.name).join(", ")}.`);
    }
    return {
      ...payload,
      package: nextPackage,
      selectedForPublishing: edit.selected,
      description,
      body: {
        ...payload.body,
        family_name: familyName,
        listing_type_id: input.listingTypeId,
        price: Math.round(edit.price * 100) / 100,
        pictures: pictureSources.map((source) => ({ source })),
        attributes: withPackageAttributes(attributeResult.attributes, nextPackage),
      },
    };
  });
  const costCache = new Map<string, Promise<{ saleFeeInCents: number; shippingCostInCents: number; calculationError?: string }>>();
  for (const payload of payloads.filter((item) => item.unitsPerPack === input.unitsPerPack && item.selectedForPublishing !== false)) {
    const body = payload.body as { price: number; listing_type_id: string; category_id: string; family_name: string; pictures: Array<{ source: string }>; attributes?: unknown[] };
    const previousDynamicErrors = new Set((payload.contentReadiness?.checks ?? []).map((check) => `${check.label}: corrija antes de publicar.`));
    const structuralErrors = clearResolvedRequiredAttributeErrors(
      (payload.readinessErrors ?? []).filter((reason) =>
        !isEditableContentError(reason)
        && !previousDynamicErrors.has(reason)
        && !(payload.package.confidence === "confirmed" && isEstimatedPackageError(reason))
      ),
      body.attributes as ListingAttribute[] | undefined,
    );
    payload.pictureDiagnostics = [];
    for (const [index, picture] of body.pictures.entries()) {
      payload.pictureDiagnostics.push(await diagnosePicture(picture.source, body.category_id, body.family_name, index === 0 ? "thumbnail" : "other"));
    }
    const main = payload.pictureDiagnostics[0];
    payload.contentReadiness = evaluateListingContent({
      familyName: body.family_name, pictures: body.pictures, videoId: null,
      description, attributes: body.attributes,
      mainPictureAccepted: main?.status === "unavailable" ? null : main?.status === "approved",
    });
    payload.readinessErrors = structuralErrors;
    if (main?.status === "issues") payload.readinessErrors.push(`Foto principal reprovada: ${main.issues.join(" ")}`);
    for (const check of payload.contentReadiness.checks.filter((item) => item.blocking && !item.passed)) {
      payload.readinessErrors.push(`${check.label}: corrija antes de publicar.`);
    }
    const pack = payload.package;
    const dimensions = `${Math.ceil(pack.heightCm)}x${Math.ceil(pack.widthCm)}x${Math.ceil(pack.lengthCm)},${Math.ceil(pack.weightGrams)}`;
    const key = `${body.category_id}:${body.listing_type_id}:${body.price}:${dimensions}`;
    if (!costCache.has(key)) costCache.set(key, (async () => {
      const feeQuery = new URLSearchParams({ price: String(body.price), listing_type_id: body.listing_type_id, category_id: body.category_id, currency_id: "BRL", logistic_type: "drop_off" });
      const shippingQuery = new URLSearchParams({ dimensions, verbose: "true", item_price: String(body.price), listing_type_id: body.listing_type_id, mode: "me2", condition: "new", logistic_type: "drop_off", free_shipping: "true" });
      const [fee, shipping] = await Promise.all([
        mercadoLivreRequest<{ sale_fee_amount?: number }>(`/sites/${connection.siteId}/listing_prices?${feeQuery}`),
        mercadoLivreRequest<{ coverage?: { all_country?: { list_cost?: number } } }>(`/users/${connection.userId}/shipping_options/free?${shippingQuery}`),
      ]);
      return {
        saleFeeInCents: Math.round(Number(fee.body?.sale_fee_amount ?? 0) * 100),
        shippingCostInCents: Math.round(Number(shipping.body?.coverage?.all_country?.list_cost ?? 0) * 100),
        ...(!fee.ok || !shipping.ok ? { calculationError: `Custos logisticos do kit ${pack.unitsPerPack} indisponiveis; revise a embalagem.` } : {}),
      };
    })());
    const costs = await costCache.get(key)!;
    const financials = classifyOfferFinancials({
      priceInCents: Math.round(body.price * 100), ...costs,
      productCostInCents: payload.productCostInCents,
      operationalCostInCents: pricingRule.marketplaceOperationalCostAmountInCents,
      taxReservePercentage: pricingRule.marketplaceTaxReservePercentage,
      minProfitInCents: pricingRule.marketplaceMinProfitAmountInCents,
      minReturnPercentage: pricingRule.marketplaceMinReturnPercentage,
      maxProductCostInCents: pricingRule.marketplaceMaxProductCostAmountInCents,
    });
    if (payload.package.confidence !== "confirmed") financials.blockReasons.push("Embalagem estimada: confirme medidas e peso antes de publicar.");
    if (costs.calculationError) financials.blockReasons.push(costs.calculationError);
    for (const reason of payload.readinessErrors) if (!financials.blockReasons.includes(reason)) financials.blockReasons.push(reason);
    if (financials.blockReasons.length) { financials.publishable = false; financials.financialStatus = "blocked"; }
    payload.fees = financials;
    payload.publishable = financials.publishable;
    payload.financialStatus = financials.financialStatus;
  }
  await Promise.all(payloads
    .filter((item) => item.unitsPerPack === input.unitsPerPack)
    .map((payload) => getDatabasePool().query(
      `UPDATE scx_catalog_marketplace_offers SET
         package_height_cm=$2, package_width_cm=$3, package_length_cm=$4,
         package_weight_grams=$5, package_confidence=$6, package_warning=$7,
         updated_at=now()
       WHERE id=$1 AND product_id=$8 AND channel='mercado_livre'`,
      [payload.offerId, payload.package.heightCm, payload.package.widthCm,
        payload.package.lengthCm, payload.package.weightGrams, payload.package.confidence,
        payload.package.warning, input.productId],
    )));
  await persistAttributeValues(input.productId, draft.categoryId, payloads.filter((item) => item.unitsPerPack === input.unitsPerPack));
  await getDatabasePool().query(
    `UPDATE scx_mercado_livre_product_drafts SET family_name=$2, description=$3, content_source='manual',
       payloads=$4::jsonb, validation_results='[]'::jsonb, status='draft', error_message=NULL, updated_at=now()
     WHERE product_id=$1`,
    [input.productId, familyName, description, JSON.stringify(payloads)],
  );
  return getMercadoLivreDraft(input.productId);
}

async function assertMercadoLivreDraftFresh(draft: MercadoLivreDraft) {
  const result = await getDatabasePool().query(
    `SELECT GREATEST(
       product.updated_at,
       COALESCE(supplier.updated_at, product.updated_at),
       COALESCE(profile.updated_at, product.updated_at),
       COALESCE(settings.updated_at, product.updated_at),
       COALESCE(MAX(product_attribute.updated_at), product.updated_at),
       COALESCE(pricing.updated_at, product.updated_at),
       COALESCE(MAX(variant.updated_at), product.updated_at)
     ) AS source_updated_at
     FROM scx_catalog_products product
     LEFT JOIN scx_catalog_supplier_products supplier ON supplier.id = product.supplier_product_id
     LEFT JOIN scx_catalog_product_variants variant ON variant.product_id = product.id
     LEFT JOIN scx_mercado_livre_category_profiles profile ON profile.catalog_category_id = product.category_id
     LEFT JOIN scx_mercado_livre_product_settings settings ON settings.product_id = product.id
     LEFT JOIN scx_mercado_livre_product_attributes product_attribute
       ON product_attribute.product_id = product.id
      AND product_attribute.category_id = COALESCE(settings.category_id, profile.category_id)
     LEFT JOIN scx_catalog_pricing_rules pricing ON pricing.scope = 'global' AND pricing.is_active = true
     WHERE product.id = $1
     GROUP BY product.updated_at, supplier.updated_at, profile.updated_at, settings.updated_at, pricing.updated_at`,
    [draft.productId],
  );
  const sourceUpdatedAt = result.rows[0]?.source_updated_at ? new Date(result.rows[0].source_updated_at) : null;
  if (sourceUpdatedAt && sourceUpdatedAt > new Date(draft.updatedAt)) {
    throw new Error("Produto, estoque, perfil ou precificacao mudou depois da previa. Gere e valide novamente.");
  }
}

export async function validateMercadoLivreDraft(productId: string, unitsPerPack?: number) {
  const draft = await getMercadoLivreDraft(productId);
  if (!draft) throw new Error("Gere o rascunho antes de validar.");
  const results = [];
  const selectedPayloads = draft.payloads.filter((payload) =>
    payload.selectedForPublishing !== false && (unitsPerPack === undefined || payload.unitsPerPack === unitsPerPack),
  );
  if (!selectedPayloads.length) throw new Error("Selecione ao menos uma variacao para validar.");
  if (selectedPayloads.some((payload) => !payload.publishable)) throw new Error("Corrija os bloqueios das variacoes selecionadas antes de validar.");
  for (const payload of selectedPayloads) {
    const response = await validateMercadoLivreItem(payload.body);
    const validation = classifyMercadoLivreValidation(response.ok, response.body);
    results.push({
      sku: payload.sku,
      ok: validation.accepted,
      status: response.status,
      warnings: validation.warnings,
      errors: validation.errors,
      response: response.body,
    });
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    const missingIds = new Set(failed.flatMap((result) => result.errors.flatMap((rawError) => {
      const error = rawError as { code?: string; message?: string };
      if (error.code !== "item.attributes.missing_required") return [];
      const match = String(error.message ?? "").match(/\[([A-Z0-9_, ]+)\]/);
      return match ? match[1].split(",").map((item) => item.trim()).filter(Boolean) : [];
    })));
    if (missingIds.size) {
      const categoryAttributes = await getMercadoLivreCategoryAttributes(draft.categoryId);
      const knownDefinitions = editableAttributeDefinitions(categoryAttributes, missingIds);
      const knownIds = new Set(knownDefinitions.map((item) => item.id));
      const definitions = [
        ...knownDefinitions,
        ...[...missingIds].filter((id) => !knownIds.has(id)).map((id) => ({
          id, name: id, required: true, valueType: "string", values: [], allowedUnits: [],
        })),
      ];
      await persistAttributeDefinitions(productId, draft.categoryId, definitions);
      const failedSkus = new Set(failed.map((result) => result.sku));
      for (const payload of draft.payloads.filter((item) => failedSkus.has(item.sku))) {
        const current = new Map((payload.editableAttributes ?? []).map((item) => [item.id, item]));
        for (const definition of definitions) current.set(definition.id, definition);
        payload.editableAttributes = [...current.values()];
        payload.readinessErrors ??= [];
        payload.fees ??= {
          saleFeeInCents: 0, shippingCostInCents: 0, netRevenueInCents: 0,
          contributionInCents: 0, contributionPercentage: 0, operationalCostInCents: 0,
          taxReserveInCents: 0, estimatedProfitInCents: 0, returnPercentage: 0, blockReasons: [],
        };
        for (const definition of definitions) {
          const reason = `Atributo obrigatorio ${definition.id} ausente.`;
          if (!payload.readinessErrors.includes(reason)) payload.readinessErrors.push(reason);
          if (!payload.fees.blockReasons.includes(reason)) payload.fees.blockReasons.push(reason);
        }
        payload.publishable = false;
        payload.financialStatus = "blocked";
      }
    }
  }
  await getDatabasePool().query(
    `UPDATE scx_mercado_livre_product_drafts SET
       validation_results = $2::jsonb,
       status = $3,
       error_message = $4,
       payloads = $5::jsonb,
       validated_at = CASE WHEN $3 = 'validated' THEN now() ELSE validated_at END,
       updated_at = now()
     WHERE product_id = $1`,
    [productId, JSON.stringify(results), failed.length ? "error" : "validated", failed.length ? `${failed.length} variacao(oes) rejeitada(s) pelo validador.` : null, JSON.stringify(draft.payloads)],
  );
  return getMercadoLivreDraft(productId);
}

export async function publishMercadoLivreDraft(productId: string, unitsPerPack: number) {
  const draft = await getMercadoLivreDraft(productId);
  if (!draft || draft.status !== "validated") {
    throw new Error("O rascunho precisa passar pelo validador antes da publicacao.");
  }
  await assertMercadoLivreDraftFresh(draft);
  const selectedPayloads = draft.payloads.filter((payload) => payload.unitsPerPack === unitsPerPack && payload.selectedForPublishing !== false);
  if (!selectedPayloads.length) throw new Error("A familia de kit selecionada nao existe nesta previa.");
  if (selectedPayloads.some((payload: MercadoLivreDraftPayload) => !payload.fees || !Array.isArray(payload.fees.blockReasons))) {
    throw new Error("A previa financeira esta desatualizada. Gere e valide uma nova previa antes de publicar.");
  }
  if (selectedPayloads.some((payload: MercadoLivreDraftPayload) => !payload.publishable)) {
    throw new Error("A familia selecionada possui bloqueios comerciais ou logisticos.");
  }
  const pool = getDatabasePool();
  const claimed = await pool.query(
    `UPDATE scx_mercado_livre_product_drafts
        SET status = 'publishing', error_message = NULL, updated_at = now()
      WHERE product_id = $1 AND status = 'validated'
      RETURNING product_id`,
    [productId],
  );
  if (!claimed.rowCount) throw new Error("Este produto ja esta sendo publicado.");
  const published = [];
  try {
    for (const payload of selectedPayloads) {
      const existing = await pool.query(
        `SELECT external_id, raw_response FROM scx_catalog_marketplace_offers
          WHERE id = $1 AND channel = 'mercado_livre' LIMIT 1`,
        [payload.offerId],
      );
      if (existing.rows[0]?.external_id) {
        const saved = existing.rows[0].raw_response ?? {};
        let description = saved.description;
        if (!description?.ok) {
          const retried = await createMercadoLivreDescription(existing.rows[0].external_id, payload.description);
          description = { ok: retried.ok, status: retried.status, body: retried.body };
          await pool.query(
            `UPDATE scx_catalog_marketplace_offers
                SET sync_status=$2, last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
              WHERE id=$1 AND channel='mercado_livre'`,
            [payload.offerId, retried.ok ? "synced" : "failed", JSON.stringify({ ...saved, description })],
          );
          if (!retried.ok) throw new Error(`${payload.sku}: anuncio criado, mas a descricao foi recusada (${retried.status}).`);
        }
        published.push({ sku: payload.sku, unitsPerPack: payload.unitsPerPack, itemId: existing.rows[0].external_id, skipped: true, response: saved.item ?? saved });
        continue;
      }
      const created = await createMercadoLivreItem(payload.body);
      if (!created.ok || !created.body?.id) {
        throw new Error(`${payload.sku}: Mercado Livre recusou a publicacao (${created.status}). ${JSON.stringify(created.body)}`);
      }
      await pool.query(
        `UPDATE scx_catalog_marketplace_offers SET external_id=$2, sync_status='pending',
           last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
         WHERE id=$1`,
        [payload.offerId, created.body.id, JSON.stringify({ item: created.body })],
      );
      const description = await createMercadoLivreDescription(created.body.id, payload.description);
      await pool.query(
        `UPDATE scx_catalog_marketplace_offers
            SET sync_status=$2, last_synced_at=now(), raw_response=$3::jsonb, updated_at=now()
          WHERE id=$1 AND channel='mercado_livre'`,
        [payload.offerId, description.ok ? "synced" : "failed", JSON.stringify({ item: created.body, description: { ok: description.ok, status: description.status, body: description.body } })],
      );
      if (!description.ok) throw new Error(`${payload.sku}: anuncio criado, mas a descricao foi recusada (${description.status}).`);
      published.push({ sku: payload.sku, unitsPerPack: payload.unitsPerPack, itemId: created.body.id, skipped: false, response: created.body });
    }
    const families = [];
    for (const unitsPerPack of [...new Set(published.map((item) => item.unitsPerPack))]) {
      const userProductId = published.find((item) => item.unitsPerPack === unitsPerPack && item.response?.user_product_id)?.response?.user_product_id;
      if (!userProductId) continue;
      const userProduct = await mercadoLivreRequest<{ family_id?: string | number }>(`/user-products/${userProductId}`);
      families.push({ unitsPerPack, userProductId, familyId: userProduct.ok ? userProduct.body?.family_id ?? null : null });
    }
    const firstFamily = families[0];
    await pool.query(
      `INSERT INTO scx_catalog_product_channel_mappings (
         id, product_id, channel, external_id, external_sku, sync_status,
         last_synced_at, raw_response
       ) VALUES ($1,$2,'mercado_livre',$3,(SELECT scx_sku FROM scx_catalog_products WHERE id=$2),'synced',now(),$4::jsonb)
       ON CONFLICT (product_id, channel) DO UPDATE SET
         external_id = EXCLUDED.external_id, sync_status = 'synced',
         last_synced_at = now(), raw_response = EXCLUDED.raw_response, updated_at = now()`,
      [randomUUID(), productId, String(firstFamily?.familyId ?? firstFamily?.userProductId ?? published[0]?.itemId), JSON.stringify({ families, items: published })],
    );
    const remainingOfferIds = draft.payloads
      .filter((payload) => payload.publishable && payload.unitsPerPack !== unitsPerPack)
      .map((payload) => payload.offerId);
    const remaining = remainingOfferIds.length ? await pool.query(
      `SELECT count(*)::int AS total FROM scx_catalog_marketplace_offers
        WHERE id = ANY($1::text[]) AND external_id IS NULL`,
      [remainingOfferIds],
    ) : { rows: [{ total: 0 }] };
    const fullyPublished = Number(remaining.rows[0]?.total ?? 0) === 0;
    await pool.query(
      `UPDATE scx_mercado_livre_product_drafts SET status=$2,
         published_at=CASE WHEN $2='published' THEN now() ELSE published_at END,
         updated_at=now() WHERE product_id=$1`,
      [productId, fullyPublished ? "published" : "validated"],
    );
    return { draft: await getMercadoLivreDraft(productId), published };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao publicar no Mercado Livre.";
    await pool.query(
      `UPDATE scx_mercado_livre_product_drafts SET status='error', error_message=$2, updated_at=now() WHERE product_id=$1`,
      [productId, message],
    );
    throw error;
  }
}
