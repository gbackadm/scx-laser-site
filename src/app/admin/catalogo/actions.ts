"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { requireAdminSession } from "@/domain/auth/session";
import {
  createManualCatalogProductForAdmin,
  getCatalogProductForAdmin,
  setCatalogPublicationStatus,
  updateCatalogProductForAdmin,
  validateProductForPublication,
} from "@/domain/catalog/adminRepository";
import { parseMoneyToCents } from "@/domain/catalog/money";
import { roleCan } from "@/domain/catalog/permissions";
import type { CatalogPublicationStatus } from "@/domain/catalog/types";
import { syncCatalogProductToOlistIfEnabled } from "@/domain/olist/repository";
import { getGlobalPricingRule } from "@/domain/pricing/rules";
import { syncCatalogProductFromAsiaImport } from "@/domain/suppliers/asiaImportRepository";

function parseInteger(value: FormDataEntryValue | null) {
  const numericValue = Number(String(value ?? "0").trim());

  return Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0;
}

function parseImageUrls(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function parseDecimalText(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .replace(",", ".");
}

function hasPositiveDecimal(value: string) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue > 0;
}

function redirectWithNewProductError(error: string): never {
  redirect(`/admin/catalogo/novo?erro=${error}`);
}

function parseReturnAnchor(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function redirectWithEditError(productId: string, error: string): never {
  redirect(`/admin/catalogo/${encodeURIComponent(productId)}/editar?erro=${error}`);
}

function redirectWithEditSuccess(productId: string, success: string): never {
  redirect(`/admin/catalogo/${encodeURIComponent(productId)}/editar?${success}=1`);
}

export async function updateCatalogProduct(formData: FormData) {
  const session = await requireAdminSession();
  const productId = String(formData.get("productId") ?? "");
  const returnAnchor = parseReturnAnchor(formData.get("returnAnchor"));

  if (!roleCan(session.role, "catalog:edit")) {
    redirectWithEditError(productId, "permissao");
  }

  const title = String(formData.get("title") ?? "").trim();
  const categoryName = String(formData.get("categoryName") ?? "").trim();
  const publicationStatus = String(
    formData.get("publicationStatus") ?? "draft",
  ) as CatalogPublicationStatus;

  if (!productId || !title || !categoryName) {
    redirectWithEditError(productId, "campos");
  }

  if (!["draft", "hidden", "published", "out_of_stock"].includes(publicationStatus)) {
    redirectWithEditError(productId, "status");
  }

  if (publicationStatus === "published" && !roleCan(session.role, "catalog:publish")) {
    redirectWithEditError(productId, "permissao");
  }

  const pricingRule = await getGlobalPricingRule();
  const stockQuantity = parseInteger(formData.get("stockQuantity"));
  const currentProduct = await getCatalogProductForAdmin(productId);
  const nextPublicationStatus =
    publicationStatus === "published" &&
    stockQuantity < pricingRule.publicationStockMinQuantity
      ? "out_of_stock"
      : currentProduct?.publicationStatus === "out_of_stock" &&
          publicationStatus === "out_of_stock" &&
          stockQuantity >= pricingRule.publicationStockMinQuantity
        ? "published"
      : publicationStatus;

  await updateCatalogProductForAdmin({
    productId,
    title,
    description: String(formData.get("description") ?? ""),
    categoryName,
    priceAmountInCents: parseMoneyToCents(formData.get("price")),
    stockQuantity,
    publicationStatus: nextPublicationStatus,
    imageUrls: parseImageUrls(formData.get("imageUrls")),
  });

  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "catalog_product_updated",
    entityType: "catalog_product",
    entityId: productId,
    summary: "Produto revisado no painel administrativo.",
  });

  revalidatePath("/admin/catalogo");
  revalidatePath(`/admin/catalogo/${productId}/editar`);
  revalidatePath("/catalogo");
  redirect(
    `/admin/catalogo/${encodeURIComponent(productId)}/editar?salvo=1${
      returnAnchor ? `&voltar=${returnAnchor}` : ""
    }`,
  );
}

export async function createManualCatalogProduct(formData: FormData) {
  const session = await requireAdminSession();

  if (!roleCan(session.role, "catalog:edit")) {
    redirectWithNewProductError("permissao");
  }

  const publicationStatus = String(
    formData.get("publicationStatus") ?? "hidden",
  ) as CatalogPublicationStatus;
  const scxSku = String(formData.get("scxSku") ?? "").trim();
  const supplierCode = String(formData.get("supplierCode") ?? "").trim();
  const supplierName = String(formData.get("supplierName") ?? "").trim();
  const olistSupplierId = String(formData.get("olistSupplierId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryName = String(formData.get("categoryName") ?? "").trim();
  const ncm = String(formData.get("ncm") ?? "").trim();
  const weightKg = parseDecimalText(formData.get("weightKg"));
  const heightCm = parseDecimalText(formData.get("heightCm"));
  const widthCm = parseDecimalText(formData.get("widthCm"));
  const lengthCm = parseDecimalText(formData.get("lengthCm"));
  const imageUrls = parseImageUrls(formData.get("imageUrls"));
  const priceAmountInCents = parseMoneyToCents(formData.get("price"));
  const costAmountInCents = parseMoneyToCents(formData.get("cost"));
  const stockQuantity = parseInteger(formData.get("stockQuantity"));

  if (
    !scxSku ||
    !supplierCode ||
    !supplierName ||
    !olistSupplierId ||
    !title ||
    !categoryName ||
    !ncm ||
    priceAmountInCents <= 0 ||
    costAmountInCents <= 0 ||
    imageUrls.length === 0 ||
    !hasPositiveDecimal(weightKg) ||
    !hasPositiveDecimal(heightCm) ||
    !hasPositiveDecimal(widthCm) ||
    !hasPositiveDecimal(lengthCm)
  ) {
    redirectWithNewProductError("campos");
  }

  if (!["draft", "hidden", "published", "out_of_stock"].includes(publicationStatus)) {
    redirectWithNewProductError("status");
  }

  if (publicationStatus === "published" && !roleCan(session.role, "catalog:publish")) {
    redirectWithNewProductError("permissao");
  }

  const pricingRule = await getGlobalPricingRule();
  const nextPublicationStatus =
    publicationStatus === "published" &&
    stockQuantity < pricingRule.publicationStockMinQuantity
      ? "out_of_stock"
      : publicationStatus;

  let productId: string;

  try {
    productId = await createManualCatalogProductForAdmin({
      scxSku,
      supplierCode,
      supplierName,
      olistSupplierId,
      title,
      description,
      categoryName,
      priceAmountInCents,
      costAmountInCents,
      stockQuantity,
      publicationStatus: nextPublicationStatus,
      ncm,
      weightKg,
      heightCm,
      widthCm,
      lengthCm,
      imageUrls,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Ja existe produto")) {
      redirectWithNewProductError("duplicado");
    }

    redirectWithNewProductError("salvar");
  }

  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "catalog_product_created",
    entityType: "catalog_product",
    entityId: productId,
    summary: "Produto manual criado no catalogo administrativo.",
  });

  let olistFeedback = "olist_pendente";
  try {
    const olistResult = await syncCatalogProductToOlistIfEnabled(productId);
    olistFeedback = olistResult.ok ? "olist_ok" : "olist_pendente";
  } catch {
    olistFeedback = "olist_erro";
  }

  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/olist");
  revalidatePath("/catalogo");
  redirect(
    `/admin/catalogo?criado=1&${olistFeedback}=1#produto-${productId.replace(
      /[^a-zA-Z0-9_-]/g,
      "",
    )}`,
  );
}

export async function publishCatalogProduct(formData: FormData) {
  const session = await requireAdminSession();
  const productId = String(formData.get("productId") ?? "");

  if (!roleCan(session.role, "catalog:publish")) {
    redirectWithEditError(productId, "permissao");
  }

  const product = await getCatalogProductForAdmin(productId);
  const pricingRule = await getGlobalPricingRule();
  const validationError = validateProductForPublication(
    product,
    pricingRule.publicationStockMinQuantity,
  );

  if (validationError) {
    if (
      product &&
      product.stock.quantity < pricingRule.publicationStockMinQuantity
    ) {
      await setCatalogPublicationStatus(productId, "out_of_stock");
      await writeAdminAuditLog({
        actorUserId: session.id,
        action: "publication_status_changed",
        entityType: "catalog_product",
        entityId: productId,
        summary: "Produto marcado como sem estoque pelo limite global.",
      });
      revalidatePath("/admin/catalogo");
      revalidatePath(`/admin/catalogo/${productId}/editar`);
      revalidatePath("/catalogo");
    }

    redirectWithEditError(productId, "validacao");
  }

  await setCatalogPublicationStatus(productId, "published");
  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "publication_status_changed",
    entityType: "catalog_product",
    entityId: productId,
    summary: "Produto publicado no catalogo publico.",
  });

  revalidatePath("/admin/catalogo");
  revalidatePath(`/admin/catalogo/${productId}/editar`);
  revalidatePath("/catalogo");
  redirect(`/admin/catalogo/${encodeURIComponent(productId)}/editar?publicado=1`);
}

export async function unpublishCatalogProduct(formData: FormData) {
  const session = await requireAdminSession();
  const productId = String(formData.get("productId") ?? "");

  if (!roleCan(session.role, "catalog:publish")) {
    redirectWithEditError(productId, "permissao");
  }

  await setCatalogPublicationStatus(productId, "hidden");
  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "publication_status_changed",
    entityType: "catalog_product",
    entityId: productId,
    summary: "Produto despublicado e mantido oculto.",
  });

  revalidatePath("/admin/catalogo");
  revalidatePath(`/admin/catalogo/${productId}/editar`);
  revalidatePath("/catalogo");
  redirect(
    `/admin/catalogo/${encodeURIComponent(productId)}/editar?despublicado=1`,
  );
}

export async function syncCatalogProductFromSupplier(formData: FormData) {
  const session = await requireAdminSession();
  const productId = String(formData.get("productId") ?? "");

  if (!roleCan(session.role, "supplier:import")) {
    redirectWithEditError(productId, "permissao");
  }

  if (!productId) {
    redirectWithEditError(productId, "produto");
  }

  try {
    await syncCatalogProductFromAsiaImport(productId);
  } catch {
    redirectWithEditError(productId, "sincronizacao");
  }

  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "catalog_product_updated",
    entityType: "catalog_product",
    entityId: productId,
    summary: "Produto sincronizado manualmente com fornecedor.",
  });

  revalidatePath("/admin/catalogo");
  revalidatePath(`/admin/catalogo/${productId}/editar`);
  revalidatePath("/catalogo");
  redirectWithEditSuccess(productId, "sincronizado");
}
