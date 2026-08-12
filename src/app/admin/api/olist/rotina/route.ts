import { NextResponse } from "next/server";

import { runScheduledOlistSyncIfDue } from "@/domain/olist/repository";

function hasCronAccess(request: Request) {
  const configuredSecret = process.env.OLIST_CRON_SECRET;

  if (!configuredSecret) {
    return false;
  }

  return request.headers.get("x-olist-cron-secret") === configuredSecret;
}

export async function POST(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json(
      { ok: false, message: "Rotina Olist nao autorizada." },
      { status: 401 },
    );
  }

  try {
    const result = await runScheduledOlistSyncIfDue();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel executar a rotina Olist.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
