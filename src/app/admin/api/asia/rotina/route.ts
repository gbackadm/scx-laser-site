import { NextResponse } from "next/server";

import { runScheduledAsiaImportSyncIfDue } from "@/domain/suppliers/asiaImportRepository";

function hasCronAccess(request: Request) {
  const configuredSecret =
    process.env.CRON_SECRET ??
    process.env.ASIA_IMPORT_CRON_SECRET ??
    process.env.OLIST_CRON_SECRET;

  if (!configuredSecret) {
    return false;
  }

  return (
    request.headers.get("authorization") === `Bearer ${configuredSecret}` ||
    request.headers.get("x-asia-cron-secret") === configuredSecret
  );
}

async function runCron(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json(
      { ok: false, message: "Rotina Asia Import nao autorizada." },
      { status: 401 },
    );
  }

  try {
    const result = await runScheduledAsiaImportSyncIfDue();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message || error.name
        : "Nao foi possivel executar a rotina Asia Import.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export const maxDuration = 300;

export const GET = runCron;
export const POST = runCron;
