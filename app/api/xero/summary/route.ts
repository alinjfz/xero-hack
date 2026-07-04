import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getXeroSummary } from "@/lib/xero-summary";

export async function GET() {
  const cookieStore = await cookies();
  const summary = await getXeroSummary(cookieStore);
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
