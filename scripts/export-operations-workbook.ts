import fs from "node:fs/promises";
import path from "node:path";
import { getOpenRouterConfig } from "@/lib/openrouter";
import { buildOperationsBoard } from "@/lib/operations-board";
import { readWebhookEvents } from "@/lib/xero-webhook-log";
import { buildShowcaseSummary, getXeroSummary } from "@/lib/xero-summary";

const cookieStore = {
  get() {
    return undefined;
  },
  set() {},
  delete() {},
};

async function main() {
  const summary = await getXeroSummary(cookieStore);
  const connectedSummary = summary.connected ? summary : buildShowcaseSummary(getOpenRouterConfig());

  const board = buildOperationsBoard(connectedSummary);
  const webhookEvents = await readWebhookEvents();
  const outputDir = path.join(process.cwd(), "outputs", "operations-workbook");
  const inputPath = path.join(outputDir, "context.json");
  const outputPath = path.join(outputDir, "kish-operations-sync.xlsx");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      summary: connectedSummary,
      board,
      webhookEvents,
    }),
    "utf8",
  );

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  await execFileAsync(process.execPath, [path.join(process.cwd(), "scripts/build-operations-workbook.mjs"), inputPath, outputPath], {
    cwd: process.cwd(),
  });

  console.log(outputPath);
}

void main();
