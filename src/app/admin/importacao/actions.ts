"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { requireAdminSession } from "@/domain/auth/session";
import { getDatabasePool } from "@/domain/catalog/db";
import { roleCan } from "@/domain/catalog/permissions";
import {
  getAsiaImportConfigStatus,
  listAsiaImportProducts,
  type AsiaImportProduct,
} from "@/domain/suppliers/asiaImport";
import {
  createCatalogDraftFromSupplierProduct,
  updateAsiaAutoSyncSettings,
  supplierProductHasCatalogProduct,
  upsertAsiaSupplierProducts,
} from "@/domain/suppliers/asiaImportRepository";

function requireImporterRole(role: "owner" | "manager" | "seller") {
  if (!roleCan(role, "supplier:import")) {
    redirect("/admin/importacao?erro=permissao");
  }
}

function parsePositiveInteger(value: FormDataEntryValue | null, fallback: number) {
  const numericValue = Number(String(value ?? "").trim());

  return Number.isFinite(numericValue)
    ? Math.max(1, Math.round(numericValue))
    : fallback;
}

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function parseStatusFilter(value: FormDataEntryValue | null) {
  const status = String(value ?? "all");

  return status === "true" || status === "false" ? status : "all";
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function productMatchesSearch(product: AsiaImportProduct, searches: string[]) {
  const normalizedSearches = searches.map(normalizeSearch).filter(Boolean);

  if (normalizedSearches.length === 0) {
    return true;
  }

  const haystack = [
    product.nome,
    product.descricao,
    product.referencia,
    ...(Array.isArray(product.categorias) ? product.categorias : []),
    ...(product.variacoes ?? []).flatMap((variation) => [
      variation.nome,
      variation.referencia,
    ]),
  ]
    .filter(Boolean)
    .map((value) => normalizeSearch(String(value)))
    .join(" ");

  return normalizedSearches.every((search) => haystack.includes(search));
}

function productKey(product: AsiaImportProduct) {
  return (
    product.referencia?.trim() ||
    product.variacoes?.[0]?.referencia?.trim() ||
    product.nome?.trim() ||
    JSON.stringify(product)
  );
}

async function listAsiaImportProductsForTarget(input: {
  startPage: number;
  targetQuantity: number;
  nome?: string;
  referencia?: string;
  cor?: string;
  status: "true" | "false" | "all";
}) {
  const products: AsiaImportProduct[] = [];
  const seenKeys = new Set<string>();
  const perPage = 10;
  const maxPages = Math.min(Math.ceil(input.targetQuantity / perPage) + 20, 30);

  for (let offset = 0; offset < maxPages && products.length < input.targetQuantity; offset += 1) {
    const page = input.startPage + offset;
    const result = await listAsiaImportProducts({
      pagina: page,
      porPagina: perPage,
      nome: input.nome,
      referencia: input.referencia,
      cor: input.cor,
      status: input.status,
    });
    const pageProducts = result.produtos ?? [];

    if (pageProducts.length === 0) {
      break;
    }

    for (const product of pageProducts) {
      if (
        !productMatchesSearch(product, [
          input.nome ?? "",
          input.referencia ?? "",
        ])
      ) {
        continue;
      }

      const key = productKey(product);
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      products.push(product);

      if (products.length >= input.targetQuantity) {
        break;
      }
    }

    if (result.total_paginas && page >= result.total_paginas) {
      break;
    }
  }

  return products;
}

export async function runAsiaImport(formData: FormData) {
  const session = await requireAdminSession();
  requireImporterRole(session.role);

  const config = getAsiaImportConfigStatus();
  if (!config.ready) {
    redirect("/admin/importacao?erro=credenciais");
  }

  const pagina = parsePositiveInteger(formData.get("pagina"), 1);
  const quantidade = Math.min(
    parsePositiveInteger(formData.get("quantidade"), 20),
    100,
  );
  const nome = String(formData.get("nome") ?? "").trim();
  const referencia = String(formData.get("referencia") ?? "").trim();
  const cor = String(formData.get("cor") ?? "").trim();
  const status = String(formData.get("status") ?? "all") as
    | "true"
    | "false"
    | "all";
  const syncRunId = randomUUID();

  await getDatabasePool().query(
    `
      INSERT INTO scx_catalog_sync_runs (
        id,
        source,
        status,
        imported_count,
        mapped_count
      )
      VALUES ($1, 'supplier_import', 'running', 0, 0)
    `,
    [syncRunId],
  );

  try {
    const products = await listAsiaImportProductsForTarget({
      startPage: pagina,
      targetQuantity: quantidade,
      nome: nome || undefined,
      referencia: referencia || undefined,
      cor: cor || undefined,
      status,
    });
    const importedCount = await upsertAsiaSupplierProducts(products);

    await getDatabasePool().query(
      `
        UPDATE scx_catalog_sync_runs
        SET status = 'completed',
          finished_at = now(),
          imported_count = $2,
          mapped_count = 0
        WHERE id = $1
      `,
      [syncRunId, importedCount],
    );
    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "sync_run_completed",
      entityType: "sync_run",
      entityId: syncRunId,
      summary: `Importacao Asia Import finalizada com ${importedCount} produto(s).`,
    });

    revalidatePath("/admin/importacao");
    redirect(`/admin/importacao?sucesso=${importedCount}&qtd=${quantidade}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";

    await getDatabasePool().query(
      `
        UPDATE scx_catalog_sync_runs
        SET status = 'failed',
          finished_at = now(),
          error_message = $2
        WHERE id = $1
      `,
      [syncRunId, message],
    );

    redirect("/admin/importacao?erro=sincronizacao");
  }
}

export async function saveAsiaAutoSyncSettings(formData: FormData) {
  const session = await requireAdminSession();
  requireImporterRole(session.role);

  const settings = await updateAsiaAutoSyncSettings({
    isEnabled: parseBoolean(formData.get("isEnabled")),
    intervalMinutes: parsePositiveInteger(formData.get("intervalMinutes"), 10),
    batchSize: parsePositiveInteger(formData.get("batchSize"), 10),
    statusFilter: parseStatusFilter(formData.get("statusFilter")),
    actorUserId: session.id,
  });

  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "sync_run_completed",
    entityType: "sync_run",
    entityId: randomUUID(),
    summary: `Configuracao Asia Import salva. Rotina ${
      settings.isEnabled ? "ativa" : "inativa"
    }.`,
  });

  revalidatePath("/admin/importacao");
  redirect("/admin/importacao?config=1");
}

export async function clearPendingAsiaImport() {
  const session = await requireAdminSession();
  requireImporterRole(session.role);

  const result = await getDatabasePool().query(
    `
      DELETE FROM scx_catalog_supplier_products supplier_product
      WHERE supplier_product.supplier_id = 'asia-import'
        AND NOT EXISTS (
          SELECT 1
          FROM scx_catalog_products catalog_product
          WHERE catalog_product.supplier_product_id = supplier_product.id
            OR catalog_product.sku = supplier_product.external_id
        )
    `,
  );

  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "sync_run_completed",
    entityType: "sync_run",
    entityId: randomUUID(),
    summary: `Importacao pendente limpa: ${result.rowCount ?? 0} produto(s) removido(s).`,
  });

  revalidatePath("/admin/importacao");
  redirect(`/admin/importacao?limpo=${result.rowCount ?? 0}`);
}

export async function createDraftFromAsiaImport(formData: FormData) {
  const session = await requireAdminSession();

  if (!roleCan(session.role, "catalog:edit")) {
    redirect("/admin/importacao?erro=permissao");
  }

  const supplierProductId = String(formData.get("supplierProductId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "").replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );

  if (!supplierProductId) {
    redirect("/admin/importacao?erro=produto");
  }

  const hadCatalogProduct =
    await supplierProductHasCatalogProduct(supplierProductId);
  const catalogProductId =
    await createCatalogDraftFromSupplierProduct(supplierProductId);

  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "catalog_product_created",
    entityType: "catalog_product",
    entityId: catalogProductId,
    summary: "Rascunho de catalogo criado a partir da Asia Import.",
  });

  revalidatePath("/admin/importacao");
  revalidatePath("/admin/catalogo");
  redirect(`/admin/importacao?rascunho=1${returnTo ? `#${returnTo}` : ""}`);
}

export async function createDraftFromAsiaImportInline(supplierProductId: string) {
  const session = await requireAdminSession();

  if (!roleCan(session.role, "catalog:edit")) {
    return {
      ok: false,
      message: "Seu usuario nao tem permissao para executar esta acao.",
    };
  }

  if (!supplierProductId) {
    return {
      ok: false,
      message: "Produto importado nao encontrado.",
    };
  }

  const hadCatalogProduct =
    await supplierProductHasCatalogProduct(supplierProductId);
  const catalogProductId =
    await createCatalogDraftFromSupplierProduct(supplierProductId);

  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "catalog_product_created",
    entityType: "catalog_product",
    entityId: catalogProductId,
    summary: "Rascunho de catalogo criado a partir da Asia Import.",
  });

  revalidatePath("/admin/importacao");
  revalidatePath("/admin/catalogo");

  return {
    ok: true,
    message: hadCatalogProduct ? "Catalogo atualizado." : "Rascunho criado.",
  };
}
