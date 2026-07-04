import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getWorldSummary } from "@/lib/world-summary";

export async function GET() {
  const cookieStore = await cookies();
  const summary = await getWorldSummary(cookieStore);
  return NextResponse.json(summary);
}
