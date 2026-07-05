import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearXeroSession, getAuthenticatedXeroClient } from "@/lib/xero";

export async function POST() {
  const cookieStore = await cookies();

  try {
    const session = await getAuthenticatedXeroClient(cookieStore);
    if (session) {
      await session.xero.revokeToken();
    }
  } catch (error) {
    console.warn("Disconnect token revocation warning:", error);
  }

  clearXeroSession(cookieStore);

  // Set a persistent cookie indicating that showcase mode has been explicitly disabled by a disconnect
  cookieStore.set("kish_showcase_disabled", "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ ok: true });
}
