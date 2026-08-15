import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getMercadoLivreConnection, saveMercadoLivreNotification } from "@/domain/mercadoLivre/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return NextResponse.json({ ok: true, ignored: true });

  const applicationId = String(payload.application_id ?? "");
  const userId = String(payload.user_id ?? "");
  const topic = String(payload.topic ?? "");
  const resource = String(payload.resource ?? "");
  if (!applicationId || !userId || !topic || !resource) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const connection = await getMercadoLivreConnection();
  const accepted = applicationId === process.env.MERCADO_LIVRE_CLIENT_ID && userId === connection?.userId;
  const fallbackId = createHash("sha256")
    .update(`${applicationId}:${userId}:${topic}:${resource}:${String(payload.sent ?? "")}`)
    .digest("base64url");

  await saveMercadoLivreNotification({
    id: String(payload.id ?? payload._id ?? fallbackId),
    applicationId,
    userId,
    topic,
    resource,
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    attempts: Math.max(1, Number(payload.attempts) || 1),
    sentAt: payload.sent ? String(payload.sent) : undefined,
    payload,
    accepted,
  });
  return NextResponse.json({ ok: true, accepted });
}
