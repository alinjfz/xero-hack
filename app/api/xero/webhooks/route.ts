import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { appendWebhookEvents } from "@/lib/xero-webhook-log";

function isValidSignature(rawBody: string, signature: string | null) {
  const webhookKey = process.env.XERO_WEBHOOK_KEY?.trim();

  if (!webhookKey || !signature) {
    return false;
  }

  const digest = crypto.createHmac("sha256", webhookKey).update(rawBody).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-xero-signature");

  const webhookKey = process.env.XERO_WEBHOOK_KEY?.trim();
  if (webhookKey && !isValidSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || "{}") as {
    firstEventSequence?: number;
    lastEventSequence?: number;
    entropy?: string;
    events?: Array<Record<string, unknown>>;
  };

  if (!payload.events?.length) {
    return NextResponse.json({
      firstEventSequence: payload.firstEventSequence ?? 0,
      lastEventSequence: payload.lastEventSequence ?? 0,
      entropy: payload.entropy ?? "",
      status: "ok",
    });
  }

  await appendWebhookEvents(
    payload.events.map((event, index) => ({
      id: String(event.eventId ?? `${Date.now()}-${index}`),
      eventCategory: typeof event.eventCategory === "string" ? event.eventCategory : undefined,
      eventType: typeof event.eventType === "string" ? event.eventType : undefined,
      resourceId: typeof event.resourceId === "string" ? event.resourceId : undefined,
      resourceUrl: typeof event.resourceUrl === "string" ? event.resourceUrl : undefined,
      tenantId: typeof event.tenantId === "string" ? event.tenantId : undefined,
      tenantType: typeof event.tenantType === "string" ? event.tenantType : undefined,
      eventDateUtc: typeof event.eventDateUtc === "string" ? event.eventDateUtc : undefined,
      receivedAt: new Date().toISOString(),
      raw: event,
    })),
  );

  return NextResponse.json({
    firstEventSequence: payload.firstEventSequence ?? 0,
    lastEventSequence: payload.lastEventSequence ?? 0,
    entropy: payload.entropy ?? "",
    status: "ok",
  });
}
