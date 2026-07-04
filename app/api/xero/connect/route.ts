import { NextResponse } from "next/server";
import { createXeroClient, getXeroConfig } from "@/lib/xero";

export async function GET() {
  const config = getXeroConfig();

  if (!config.isConfigured) {
    return NextResponse.redirect(new URL("/?error=xero_not_configured", config.redirectUri ?? "http://localhost:3000"));
  }

  const xero = await createXeroClient();
  const consentUrl = await xero.buildConsentUrl();

  return NextResponse.redirect(consentUrl);
}
