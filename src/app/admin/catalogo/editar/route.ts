import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import {
  getCatalogProductForAdmin,
  updateCatalogProductForAdmin,
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

function parseInteger(value: unknown) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0;
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentAdminSession();
    const body = await request.json().catch(() => null);
    const productId = String(body?.productId ?? "");
    const title = String(body?.title ?? "").trim();
    const categoryName = String(body?.categoryName ?? "").trim();
    const publicationStatus = body?.publicationStatus;
    const imageUrls = Array.isArray(body?.imageUrls)
      ? body.imageUrls
          .map(String)
          .map((url: string) => url.trim())
          .filter(Boolean)
      : [];

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "Sessao expirada. Entre novamente no admin." },
        { status: 401 },
      );
    }

    if (!roleCan(session.role, "catalog:edit")) {
      return NextResponse.json(
        { ok: false, message: "Seu usuario nao tem permissao para editar produtos." },
        { status: 403 },
      );
    }

    if (!productId || !title || !categoryName) {
      return NextResponse.json(
        { ok: false, message: "Preencha titulo e categoria antes de salvar." },
        { status: 400 },
      );
    }

    if (imageUrls.length === 0 || imageUrls.length > 10) {
      return NextResponse.json(
        { ok: false, message: "Adicione de 1 a 10 fotos validas antes de salvar." },
        { status: 400 },
      );
    }

    const hasInvalidImageUrl = imageUrls.some((value: string) => {
      try {
        const url = new URL(value);
        return url.protocol !== "http:" && url.protocol !== "https:";
      } catch {
        return true;
      }
    });

    if (hasInvalidImageUrl) {
      return NextResponse.json(
        { ok: false, message: "Use apenas enderecos completos de fotos." },
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

    const stockQuantity = parseInteger(body?.stockQuantity);
    const pricingRule = await getGlobalPricingRule();
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
      description: String(body?.description ?? ""),
      categoryName,
      priceAmountInCents: parseInteger(body?.priceAmountInCents),
      stockQuantity,
      publicationStatus: nextPublicationStatus,
      imageUrls,
    });

    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "catalog_product_updated",
      entityType: "catalog_product",
      entityId: productId,
      summary: "Produto revisado no modal de edicao rapida.",
    });

    revalidatePath("/admin/catalogo");
    revalidatePath(`/admin/catalogo/${productId}/editar`);
    revalidatePath("/catalogo");

    return NextResponse.json({
      ok: true,
      message:
        nextPublicationStatus === "out_of_stock" && publicationStatus === "published"
          ? `Produto salvo como sem estoque: abaixo de ${pricingRule.publicationStockMinQuantity} un.`
          : nextPublicationStatus === "published" &&
              currentProduct?.publicationStatus === "out_of_stock"
            ? "Produto salvo e publicado novamente."
          : "Produto salvo.",
      publicationStatus: nextPublicationStatus,
    });
  } catch (error) {
    console.error("Erro ao salvar produto no catalogo.", error);

    return NextResponse.json(
      { ok: false, message: "Nao foi possivel salvar este produto agora." },
      { status: 500 },
    );
  }
}
