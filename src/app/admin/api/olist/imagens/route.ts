import { NextResponse } from "next/server";

import { getCurrentAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import { syncOlistImagesV2 } from "@/domain/olist/repository";

export async function POST(request: Request) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, message: "Sua sessao expirou. Entre no painel novamente." },
        { status: 401 },
      );
    }
    if (!roleCan(session.role, "supplier:import")) {
      return NextResponse.json(
        { ok: false, message: "Seu usuario nao pode sincronizar o Olist." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const result = await syncOlistImagesV2({
      limit: 20,
      all: body?.all !== false,
      onlyFailed: body?.onlyFailed === true,
    });
    return NextResponse.json({
      ok: !result.skipped && result.failed === 0,
      message: result.message,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel sincronizar as imagens agora.",
      },
      { status: 500 },
    );
  }
}
