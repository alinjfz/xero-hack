import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createXeroClient, getXeroConfig, saveXeroSession } from "@/lib/xero";

export async function GET(request: Request) {
  const config = getXeroConfig();

  if (!config.isConfigured) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    const xero = await createXeroClient();
    const tokenSet = await xero.apiCallback(request.url);
    await xero.updateTenants(false);

    const tenant = xero.tenants[0];

    if (!tenant?.tenantId) {
      return NextResponse.redirect(new URL("/?error=no_tenant", request.url));
    }

    const cookieStore = await cookies();
    saveXeroSession(cookieStore, {
      tokenSet: tokenSet as Record<string, unknown>,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName ?? "Connected tenant",
    });

    // Delete the showcase disabled flag now that they have successfully connected
    cookieStore.delete("kish_showcase_disabled");

    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    const url = new URL("/", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "xero_callback_failed");
    return NextResponse.redirect(url);
  }
}
