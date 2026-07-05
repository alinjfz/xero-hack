import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildOperationsBoard } from "@/lib/operations-board";
import { getXeroSummary } from "@/lib/xero-summary";

export async function GET() {
  const cookieStore = await cookies();
  const summary = await getXeroSummary(cookieStore);

  if (!summary.connected) {
    return NextResponse.json({ error: "Xero is not connected." }, { status: 400 });
  }

  return NextResponse.json(buildOperationsBoard(summary), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
