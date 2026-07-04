import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseStoredTokenSet, XERO_TENANT_COOKIE, XERO_TOKEN_COOKIE } from "@/lib/xero";

export async function GET() {
  const cookieStore = await cookies();
  const tokenSet = parseStoredTokenSet(cookieStore.get(XERO_TOKEN_COOKIE)?.value);
  const tenantId = cookieStore.get(XERO_TENANT_COOKIE)?.value;

  if (!tokenSet?.refresh_token || !tenantId) {
    return NextResponse.json(
      { error: "Connect Xero in the browser first, then call this endpoint." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    refreshToken: tokenSet.refresh_token,
    tenantId,
    hint: "Add these to .env.local as XERO_REFRESH_TOKEN and XERO_TENANT_ID for npm run seed:xero",
  });
}
