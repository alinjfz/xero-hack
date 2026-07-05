import { type TokenSetParameters, XeroClient } from "xero-node";

export const XERO_TOKEN_COOKIE = "kish_xero_token";
export const XERO_TENANT_COOKIE = "kish_xero_tenant";
export const XERO_TENANT_NAME_COOKIE = "kish_xero_tenant_name";

type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
      path?: string;
      maxAge?: number;
    },
  ): void;
  delete(name: string): void;
};

type StoredTokenSet = TokenSetParameters & {
  expires_in?: number;
  scope?: string[] | string;
};

async function refreshTokenSetDirect(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<StoredTokenSet> {
  const basic = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Unable to refresh Xero token.");
  }

  const data = (await response.json()) as StoredTokenSet;

  if (!data.access_token) {
    throw new Error("Xero token refresh did not return an access token.");
  }

  return data;
}

export function getXeroConfig() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  const scopes = (process.env.XERO_SCOPES ??
    "offline_access accounting.settings.read accounting.contacts accounting.contacts.read accounting.invoices accounting.invoices.read accounting.payments accounting.payments.read accounting.reports.banksummary.read")
    .split(" ")
    .filter(Boolean);

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    isConfigured: Boolean(clientId && clientSecret && redirectUri),
  };
}

export async function createXeroClient() {
  const config = getXeroConfig();

  if (!config.isConfigured) {
    throw new Error("Missing Xero environment variables.");
  }

  const xero = new XeroClient({
    clientId: config.clientId!,
    clientSecret: config.clientSecret!,
    redirectUris: [config.redirectUri!],
    scopes: config.scopes,
  });

  await xero.initialize();

  return xero;
}

export function parseStoredTokenSet(raw: string | undefined): StoredTokenSet | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredTokenSet;
  } catch {
    return null;
  }
}

export function isTokenExpired(tokenSet: StoredTokenSet | null) {
  if (!tokenSet?.expires_at) {
    return true;
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  return tokenSet.expires_at <= nowInSeconds + 60;
}

function toTokenSetParameters(tokenSet: StoredTokenSet): TokenSetParameters {
  return {
    ...tokenSet,
    scope: Array.isArray(tokenSet.scope) ? tokenSet.scope.join(" ") : tokenSet.scope,
  };
}

export function saveXeroSession(
  cookieStore: CookieStore,
  params: {
    tokenSet: StoredTokenSet;
    tenantId: string;
    tenantName: string;
  },
) {
  const sharedOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };

  cookieStore.set(XERO_TOKEN_COOKIE, JSON.stringify(params.tokenSet), sharedOptions);
  cookieStore.set(XERO_TENANT_COOKIE, params.tenantId, sharedOptions);
  cookieStore.set(XERO_TENANT_NAME_COOKIE, params.tenantName, sharedOptions);
}

export function clearXeroSession(cookieStore: CookieStore) {
  cookieStore.delete(XERO_TOKEN_COOKIE);
  cookieStore.delete(XERO_TENANT_COOKIE);
  cookieStore.delete(XERO_TENANT_NAME_COOKIE);
}

export async function getAuthenticatedXeroClient(cookieStore: CookieStore) {
  const tokenSet = parseStoredTokenSet(cookieStore.get(XERO_TOKEN_COOKIE)?.value);
  const tenantId = cookieStore.get(XERO_TENANT_COOKIE)?.value;
  const tenantName = cookieStore.get(XERO_TENANT_NAME_COOKIE)?.value ?? "Connected tenant";
  const config = getXeroConfig();

  if (!tokenSet || !tenantId) {
    return null;
  }

  const xero = await createXeroClient();
  xero.setTokenSet(toTokenSetParameters(tokenSet));

  let currentTokenSet = tokenSet;

  if (isTokenExpired(tokenSet)) {
    let refreshedTokenSet: StoredTokenSet;

    try {
      refreshedTokenSet = (await xero.refreshToken()) as StoredTokenSet;
    } catch {
      if (!config.clientId || !config.clientSecret || !tokenSet.refresh_token) {
        throw new Error("Unable to refresh Xero browser session.");
      }

      refreshedTokenSet = await refreshTokenSetDirect({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: tokenSet.refresh_token,
      });
      xero.setTokenSet(toTokenSetParameters(refreshedTokenSet));
    }

    currentTokenSet = refreshedTokenSet;
    try {
      saveXeroSession(cookieStore, {
        tokenSet: refreshedTokenSet,
        tenantId,
        tenantName,
      });
    } catch (cookieError) {
      console.warn("Could not save refreshed cookie session in GET handler:", cookieError);
    }
  }

  return {
    xero,
    tokenSet: currentTokenSet,
    tenantId,
    tenantName,
  };
}

export async function getCliAuthenticatedXeroClient() {
  const refreshToken = process.env.XERO_REFRESH_TOKEN?.trim();
  const tenantId = process.env.XERO_TENANT_ID?.trim();
  const config = getXeroConfig();

  if (!refreshToken || !tenantId) {
    throw new Error("Set XERO_REFRESH_TOKEN and XERO_TENANT_ID in .env.local for CLI commands.");
  }

  if (!config.clientId || !config.clientSecret) {
    throw new Error("Missing Xero client configuration.");
  }

  const xero = await createXeroClient();
  let tokenSet: StoredTokenSet;

  try {
    xero.setTokenSet({
      refresh_token: refreshToken,
    });
    tokenSet = (await xero.refreshToken()) as StoredTokenSet;
  } catch {
    tokenSet = await refreshTokenSetDirect({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken,
    });
  }

  xero.setTokenSet(toTokenSetParameters(tokenSet));

  return {
    xero,
    tokenSet,
    tenantId,
    tenantName: "CLI tenant",
  };
}
