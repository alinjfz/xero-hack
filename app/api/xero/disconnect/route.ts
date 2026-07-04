import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearXeroSession, getAuthenticatedXeroClient } from "@/lib/xero";

export async function POST() {
  const cookieStore = await cookies();
  const session = await getAuthenticatedXeroClient(cookieStore);

  if (session) {
    try {
      await session.xero.revokeToken();
    } catch {
      // Clearing local session state is enough for the starter app.
    }
  }

  clearXeroSession(cookieStore);
  return NextResponse.json({ ok: true });
}
