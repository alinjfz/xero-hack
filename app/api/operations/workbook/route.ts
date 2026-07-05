import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildOperationsBoard } from "@/lib/operations-board";
import { readWebhookEvents } from "@/lib/xero-webhook-log";
import { getXeroSummary } from "@/lib/xero-summary";

const execFileAsync = promisify(execFile);

export async function GET() {
  const cookieStore = await cookies();
  const summary = await getXeroSummary(cookieStore);

  if (!summary.connected) {
    return NextResponse.json({ error: "Xero is not connected." }, { status: 400 });
  }

  const [webhookEvents, board] = await Promise.all([
    readWebhookEvents(),
    Promise.resolve(buildOperationsBoard(summary)),
  ]);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kish-workbook-"));
  const inputPath = path.join(tempDir, "context.json");
  const outputPath = path.join(tempDir, "kish-operations-sync.xlsx");

  await fs.writeFile(
    inputPath,
    JSON.stringify({
      summary,
      board,
      webhookEvents,
    }),
    "utf8",
  );

  await execFileAsync(process.execPath, [path.join(process.cwd(), "scripts/build-operations-workbook.mjs"), inputPath, outputPath], {
    cwd: process.cwd(),
  });

  const workbook = await fs.readFile(outputPath);

  return new Response(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="kish-operations-sync.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
