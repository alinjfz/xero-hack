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

export function getXeroConfig() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  const scopes = (process.env.XERO_SCOPES ??
    "offline_access accounting.settings.read accounting.invoices.read")
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

  if (!tokenSet || !tenantId) {
    return null;
  }

  const xero = await createXeroClient();
  xero.setTokenSet(toTokenSetParameters(tokenSet));

  let currentTokenSet = tokenSet;

  if (isTokenExpired(tokenSet)) {
    const refreshedTokenSet = (await xero.refreshToken()) as StoredTokenSet;
    currentTokenSet = refreshedTokenSet;
    saveXeroSession(cookieStore, {
      tokenSet: refreshedTokenSet,
      tenantId,
      tenantName,
    });
  }

  return {
    xero,
    tokenSet: currentTokenSet,
    tenantId,
    tenantName,
  };
}
