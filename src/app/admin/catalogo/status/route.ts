import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { requireAdminSession } from "@/domain/auth/session";
import {
  getCatalogProductForAdmin,
  setCatalogPublicationStatus,
  validateProductForPublication,
} from "@/domain/catalog/adminRepository";
import { roleCan } from "@/domain/catalog/permissions";
import type { CatalogPublicationStatus } from "@/domain/catalog/types";
import { getGlobalPricingRule } from "@/domain/pricing/rules";

function isCatalogPublicationStatus(
  value: unknown,
): value is CatalogPublicationStatus {
  return (
    value === "draft" ||
    value === "hidden" ||
    value === "published" ||
    value === "out_of_stock"
  );
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  const body = await request.json().catch(() => null);
  const productId = String(body?.productId ?? "");
  const publicationStatus = body?.publicationStatus;

  if (!roleCan(session.role, "catalog:edit")) {
    return NextResponse.json(
      { ok: false, message: "Seu usuario nao tem permissao para alterar produtos." },
      { status: 403 },
    );
  }

  if (!productId) {
    return NextResponse.json(
      { ok: false, message: "Produto nao encontrado." },
      { status: 400 },
    );
  }

  if (!isCatalogPublicationStatus(publicationStatus)) {
    return NextResponse.json(
      { ok: false, message: "Use um status valido." },
      { status: 400 },
    );
  }

  if (publicationStatus === "published" && !roleCan(session.role, "catalog:publish")) {
    return NextResponse.json(
      { ok: false, message: "Seu usuario nao tem permissao para publicar produtos." },
      { status: 403 },
    );
  }

  const product = await getCatalogProductForAdmin(productId);

  if (!product) {
    return NextResponse.json(
      { ok: false, message: "Produto nao encontrado." },
      { status: 404 },
    );
  }

  if (publicationStatus === "published") {
    const pricingRule = await getGlobalPricingRule();
    const validationError = validateProductForPublication(
      product,
      pricingRule.publicationStockMinQuantity,
    );

    if (validationError) {
      if (product.stock.quantity < pricingRule.publicationStockMinQuantity) {
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

        return NextResponse.json({
          ok: true,
          message: `Estoque abaixo de ${pricingRule.publicationStockMinQuantity} un. Produto saiu do publico.`,
          publicationStatus: "out_of_stock",
        });
      }

      return NextResponse.json(
        { ok: false, message: validationError },
        { status: 400 },
      );
    }
  }

  await setCatalogPublicationStatus(productId, publicationStatus);
  await writeAdminAuditLog({
    actorUserId: session.id,
    action: "publication_status_changed",
    entityType: "catalog_product",
    entityId: productId,
    summary: `Status do produto alterado para ${publicationStatus}.`,
  });

  revalidatePath("/admin/catalogo");
  revalidatePath(`/admin/catalogo/${productId}/editar`);
  revalidatePath("/catalogo");

  return NextResponse.json({
    ok: true,
    message: "Status atualizado.",
    publicationStatus,
  });
}
