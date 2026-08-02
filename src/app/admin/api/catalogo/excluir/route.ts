import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/domain/auth/audit";
import { getCurrentAdminSession } from "@/domain/auth/session";
import {
  deleteCatalogProductForAdmin,
  getCatalogProductForAdmin,
} from "@/domain/catalog/adminRepository";
import { roleCan } from "@/domain/catalog/permissions";
import { markSupplierProductPendingIfUnmapped } from "@/domain/suppliers/asiaImportRepository";

export async function POST(request: Request) {
  try {
    const session = await getCurrentAdminSession();
    const body = await request.json().catch(() => null);
    const productId = String(body?.productId ?? "");

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message: "Sua sessao expirou. Entre no painel de novo para excluir.",
        },
        { status: 401 },
      );
    }

    if (!roleCan(session.role, "catalog:edit")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Seu usuario nao tem permissao para excluir produtos.",
        },
        { status: 403 },
      );
    }

    if (!productId) {
      return NextResponse.json(
        { ok: false, message: "Produto nao encontrado." },
        { status: 400 },
      );
    }

    const product = await getCatalogProductForAdmin(productId);

    if (!product) {
      return NextResponse.json(
        { ok: false, message: "Produto nao encontrado." },
        { status: 404 },
      );
    }

    await writeAdminAuditLog({
      actorUserId: session.id,
      action: "catalog_product_deleted",
      entityType: "catalog_product",
      entityId: productId,
      summary: `Produto excluido do catalogo administrativo: ${product.title}.`,
    });
    await deleteCatalogProductForAdmin(productId);
    if (product.supplierProductId) {
      await markSupplierProductPendingIfUnmapped(product.supplierProductId);
    }

    revalidatePath("/admin/catalogo");
    revalidatePath("/admin/importacao");
    revalidatePath("/catalogo");

    return NextResponse.json({ ok: true, message: "Produto excluido." });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel excluir o produto.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
