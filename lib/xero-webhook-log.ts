import fs from "node:fs/promises";
import path from "node:path";

export type LoggedWebhookEvent = {
  id: string;
  eventCategory?: string;
  eventType?: string;
  resourceId?: string;
  resourceUrl?: string;
  tenantId?: string;
  tenantType?: string;
  eventDateUtc?: string;
  receivedAt: string;
  raw: Record<string, unknown>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const EVENTS_PATH = path.join(DATA_DIR, "xero-webhook-events.json");

export async function readWebhookEvents() {
  try {
    const raw = await fs.readFile(EVENTS_PATH, "utf8");
    return JSON.parse(raw) as LoggedWebhookEvent[];
  } catch {
    return [];
  }
}

export async function appendWebhookEvents(events: LoggedWebhookEvent[]) {
  const current = await readWebhookEvents();
  const merged = [...events, ...current].slice(0, 200);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(EVENTS_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
