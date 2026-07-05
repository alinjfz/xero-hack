import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const artifactToolUrl = pathToFileURL(
  "/Users/ali/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs",
).href;
const { SpreadsheetFile, Workbook } = await import(artifactToolUrl);

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/build-operations-workbook.mjs <input.json> <output.xlsx>");
}

const raw = await fs.readFile(inputPath, "utf8");
const payload = JSON.parse(raw);
const workbook = Workbook.create();

function headerRow(sheet, title, subtitle) {
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A2:H2").merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A1:H2").format.fill = "#1F2431";
  sheet.getRange("A1:H2").format.font = { color: "#FFFFFF", bold: true };
  sheet.getRange("A1").format.font = { color: "#FFFFFF", bold: true, size: 16 };
  sheet.getRange("A2").format.font = { color: "#D9E2F2", size: 10 };
}

function styleTable(range) {
  range.format.borders = { preset: "all", style: "thin", color: "#D7DBE3" };
  range.format.wrapText = true;
  range.format.autofitColumns();
}

const overview = workbook.worksheets.add("Overview");
overview.showGridLines = false;
headerRow(
  overview,
  `${payload.summary.organisation.name} Ops Sync`,
  "Upload this workbook into Google Sheets, then refresh it from KISH as Xero data and webhook events change.",
);
overview.getRange("A4:D8").values = [
  ["Metric", "Value", "Notes", "Source"],
  ["Bank balance", payload.summary.metrics.bankBalance ?? 0, "Live from connected Xero tenant", "Xero summary"],
  ["Open receivables", payload.summary.metrics.receivablesAmount, "Awaiting payment across house and business", "Xero summary"],
  ["Overdue invoices", payload.summary.metrics.overdue, "Count of overdue receivables", "Xero summary"],
  ["Draft invoices", payload.summary.metrics.draftInvoices, "Items still in draft state", "Xero summary"],
];
styleTable(overview.getRange("A4:D8"));

const tasks = workbook.worksheets.add("Tasks");
tasks.showGridLines = false;
headerRow(tasks, "Task board", "Current tasks and completions for operational follow-up.");
tasks.getRange("A4:F4").values = [["Status", "Title", "Detail", "Location", "XP", "Reason"]];
if (payload.board.tasks.length > 0) {
  tasks.getRange(`A5:F${4 + payload.board.tasks.length}`).values = payload.board.tasks.map((task) => [
    "To do",
    task.title,
    task.detail,
    task.location,
    task.xp,
    task.reason,
  ]);
}
styleTable(tasks.getRange(`A4:F${Math.max(5, 4 + payload.board.tasks.length)}`));

const followups = workbook.worksheets.add("Follow Ups");
followups.showGridLines = false;
headerRow(followups, "Growth radar", "Priority follow-ups and retainer candidates from the live ledger.");
followups.getRange("A4:E4").values = [["Customer", "Open amount", "Open invoices", "Repeat jobs", "Reason"]];
if (payload.board.followupTargets.length > 0) {
  followups.getRange(`A5:E${4 + payload.board.followupTargets.length}`).values = payload.board.followupTargets.map((item) => [
    item.customerName,
    item.amountDue,
    item.invoiceCount,
    item.repeatCount,
    item.reason,
  ]);
}
styleTable(followups.getRange(`A4:E${Math.max(5, 4 + payload.board.followupTargets.length)}`));

const tax = workbook.worksheets.add("Tax Readiness");
tax.showGridLines = false;
headerRow(tax, "Tax readiness", "Checklist items from Xero data for landlord/business prep and accountant handoff.");
tax.getRange("A4:D4").values = [["Item", "Status", "Count", "Detail"]];
if (payload.board.taxChecklist.length > 0) {
  tax.getRange(`A5:D${4 + payload.board.taxChecklist.length}`).values = payload.board.taxChecklist.map((item) => [
    item.title,
    item.status,
    item.count,
    item.detail,
  ]);
}
styleTable(tax.getRange(`A4:D${Math.max(5, 4 + payload.board.taxChecklist.length)}`));

const webhook = workbook.worksheets.add("Webhook Events");
webhook.showGridLines = false;
headerRow(webhook, "Webhook event log", "Recent real Xero webhook deliveries captured by KISH.");
webhook.getRange("A4:G4").values = [["Received", "Category", "Type", "Tenant", "Resource", "Event date", "Resource URL"]];
if (payload.webhookEvents.length > 0) {
  webhook.getRange(`A5:G${4 + payload.webhookEvents.length}`).values = payload.webhookEvents.map((event) => [
    event.receivedAt,
    event.eventCategory ?? "",
    event.eventType ?? "",
    event.tenantId ?? "",
    event.resourceId ?? "",
    event.eventDateUtc ?? "",
    event.resourceUrl ?? "",
  ]);
}
styleTable(webhook.getRange(`A4:G${Math.max(5, 4 + payload.webhookEvents.length)}`));

for (const sheet of workbook.worksheets.items) {
  sheet.getRange("A1:Z200").format.font = { name: "Aptos", size: 10, color: "#232837" };
  sheet.getRange("A1:Z200").format.verticalAlignment = "center";
  sheet.getRange("A1:Z200").format.autofitColumns();
  sheet.freezePanes.freezeRows(4);
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
