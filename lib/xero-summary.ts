import { clearXeroSession, getAuthenticatedXeroClient, getXeroConfig } from "@/lib/xero";

type CookieStoreLike = {
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

type SummaryResponse =
  | {
      configured: false;
      connected: false;
      error: string;
    }
  | {
      configured: true;
      connected: false;
      error?: string;
    }
  | {
      configured: true;
      connected: true;
      organisation: {
        id: string;
        name: string;
        legalName: string | null;
        countryCode: string | null;
        baseCurrency: string | null;
      };
      tenant: {
        id: string;
        name: string;
      };
      metrics: {
        accounts: number;
        bankAccounts: number;
        draftInvoices: number;
        awaitingPayment: number;
        overdue: number;
      };
    };

type InvoiceSummary = {
  status?: string;
  amountDue?: number;
  dueDateString?: string;
};

type InvoiceLookup = {
  body: {
    invoices?: InvoiceSummary[];
  };
};

type AccountingInvoicesApi = {
  getInvoices(
    tenantId: string,
    ifModifiedSince?: Date,
    where?: string,
    order?: string,
    ids?: string[],
    invoiceNumbers?: string[],
    page?: number,
  ): Promise<InvoiceLookup>;
};

function countByStatus(invoices: Array<{ status?: string; amountDue?: number; dueDateString?: string }>) {
  const now = new Date();
  let draftInvoices = 0;
  let awaitingPayment = 0;
  let overdue = 0;

  for (const invoice of invoices) {
    if (invoice.status === "DRAFT") {
      draftInvoices += 1;
    }

    if (invoice.status === "AUTHORISED" && (invoice.amountDue ?? 0) > 0) {
      awaitingPayment += 1;
      if (invoice.dueDateString && new Date(invoice.dueDateString) < now) {
        overdue += 1;
      }
    }
  }

  return { draftInvoices, awaitingPayment, overdue };
}

export async function getXeroSummary(cookieStore: CookieStoreLike): Promise<SummaryResponse> {
  const config = getXeroConfig();

  if (!config.isConfigured) {
    return {
      configured: false,
      connected: false,
      error: "Add your Xero client ID, client secret, and redirect URI to start the OAuth flow.",
    };
  }

  const session = await getAuthenticatedXeroClient(cookieStore);

  if (!session) {
    return {
      configured: true,
      connected: false,
    };
  }

  try {
    const { xero, tenantId, tenantName } = session;
    const [organisationsResponse, accountsResponse, invoicesResponse] = await Promise.all([
      xero.accountingApi.getOrganisations(tenantId),
      xero.accountingApi.getAccounts(tenantId),
      (xero.accountingApi as AccountingInvoicesApi).getInvoices(
        tenantId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
      ),
    ]);

    const organisation = organisationsResponse.body.organisations?.[0];
    const accounts = accountsResponse.body.accounts ?? [];
    const invoices = invoicesResponse.body.invoices ?? [];
    const statusCounts = countByStatus(invoices);

    return {
      configured: true,
      connected: true,
      organisation: {
        id: organisation?.organisationID ?? tenantId,
        name: organisation?.name ?? tenantName,
        legalName: organisation?.legalName ?? null,
        countryCode: organisation?.countryCode ? String(organisation.countryCode) : null,
        baseCurrency: organisation?.baseCurrency ? String(organisation.baseCurrency) : null,
      },
      tenant: {
        id: tenantId,
        name: tenantName,
      },
      metrics: {
        accounts: accounts.length,
        bankAccounts: accounts.filter((account) => String(account.type) === "BANK").length,
        draftInvoices: statusCounts.draftInvoices,
        awaitingPayment: statusCounts.awaitingPayment,
        overdue: statusCounts.overdue,
      },
    };
  } catch (error) {
    clearXeroSession(cookieStore);
    return {
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : "The Xero session could not be refreshed.",
    };
  }
}
