import { cookies } from "next/headers";
import { buildOperationsBoard } from "@/lib/operations-board";
import { getXeroSummary } from "@/lib/xero-summary";

function escapeCsv(value: string | number) {
  const stringValue = String(value);

  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export async function GET() {
  const cookieStore = await cookies();
  const summary = await getXeroSummary(cookieStore);

  if (!summary.connected) {
    return new Response("Xero is not connected.", { status: 400 });
  }

  const board = buildOperationsBoard(summary);
  const headers = ["type", "title", "detail", "location", "xp", "reason"];
  const rows = [
    headers.join(","),
    ...board.sheetsRows.map((row) =>
      headers.map((header) => escapeCsv(row[header] ?? "")).join(","),
    ),
  ];

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kish-operations-board.csv"',
      "Cache-Control": "no-store",
    },
  });
}
