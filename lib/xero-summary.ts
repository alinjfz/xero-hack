import { type XeroClient } from "xero-node";
import { clearXeroSession, getAuthenticatedXeroClient, getXeroConfig } from "@/lib/xero";
import { getOpenRouterConfig } from "@/lib/openrouter";

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

type Insight = {
  id: string;
  tone: "positive" | "watch" | "urgent";
  title: string;
  body: string;
};

type AgentSuggestion = {
  id: string;
  title: string;
  summary: string;
  actionLabel: string;
  checklist: string[];
};

type CustomerSnapshot = {
  name: string;
  amountDue: number;
  invoiceCount: number;
  overdueCount: number;
};

type SupplierSnapshot = {
  name: string;
  amountDue: number;
  billCount: number;
  overdueCount: number;
};

export type InvoiceSnapshot = {
  invoiceId: string;
  invoiceNumber: string;
  contactName: string;
  reference: string | null;
  amountDue: number;
  total: number;
  currency: string | null;
  issueDate: string | null;
  dueDate: string | null;
  status: string;
  isOverdue: boolean;
  daysOverdue: number;
};

export type SummaryResponse =
  | {
      configured: false;
      connected: false;
      error: string;
      openRouter: {
        configured: boolean;
        model: string | null;
      };
    }
  | {
      configured: true;
      connected: false;
      error?: string;
      openRouter: {
        configured: boolean;
        model: string | null;
      };
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
        bankBalance: number | null;
        draftInvoices: number;
        awaitingPayment: number;
        overdue: number;
        receivablesAmount: number;
        overdueAmount: number;
        dueSoonAmount: number;
        averageInvoiceValue: number;
      };
      invoices: {
        allReceivables: InvoiceSnapshot[];
        allPayables: InvoiceSnapshot[];
        awaitingPayment: InvoiceSnapshot[];
        overdue: InvoiceSnapshot[];
        dueSoon: InvoiceSnapshot[];
        bills: InvoiceSnapshot[];
        drafts: InvoiceSnapshot[];
      };
      insights: Insight[];
      agents: AgentSuggestion[];
      customers: CustomerSnapshot[];
      suppliers: SupplierSnapshot[];
      openRouter: {
        configured: boolean;
        model: string | null;
      };
    };

type InvoiceSummary = {
  invoiceID?: string;
  invoiceNumber?: string;
  reference?: string;
  status?: string;
  type?: string;
  total?: number;
  amountDue?: number;
  currencyCode?: string;
  dateString?: string;
  dueDateString?: string;
  contact?: {
    name?: string;
  };
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

function normaliseInvoice(invoice: InvoiceSummary): InvoiceSnapshot {
  const now = new Date();
  const dueDate = invoice.dueDateString ?? null;
  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  const isOverdue = Boolean(parsedDueDate && parsedDueDate < now && (invoice.amountDue ?? 0) > 0);
  const daysOverdue = parsedDueDate
    ? Math.max(0, Math.floor((now.getTime() - parsedDueDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    invoiceId: invoice.invoiceID ?? invoice.invoiceNumber ?? "unknown-invoice",
    invoiceNumber: invoice.invoiceNumber ?? "Unnumbered invoice",
    contactName: invoice.contact?.name ?? "Unknown contact",
    reference: invoice.reference ?? null,
    amountDue: invoice.amountDue ?? 0,
    total: invoice.total ?? 0,
    currency: invoice.currencyCode ? String(invoice.currencyCode) : null,
    issueDate: invoice.dateString ?? null,
    dueDate,
    status: invoice.status ?? "UNKNOWN",
    isOverdue,
    daysOverdue,
  };
}

function currency(amount: number, currencyCode: string | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode ?? "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildCustomerSnapshots(invoices: InvoiceSnapshot[]) {
  const grouped = new Map<string, CustomerSnapshot>();

  for (const invoice of invoices) {
    if (invoice.amountDue <= 0) {
      continue;
    }

    const existing = grouped.get(invoice.contactName) ?? {
      name: invoice.contactName,
      amountDue: 0,
      invoiceCount: 0,
      overdueCount: 0,
    };

    existing.amountDue += invoice.amountDue;
    existing.invoiceCount += 1;
    if (invoice.isOverdue) {
      existing.overdueCount += 1;
    }

    grouped.set(invoice.contactName, existing);
  }

  return [...grouped.values()].sort((left, right) => right.amountDue - left.amountDue).slice(0, 5);
}

function buildSupplierSnapshots(invoices: InvoiceSnapshot[]) {
  const grouped = new Map<string, SupplierSnapshot>();

  for (const invoice of invoices) {
    if (invoice.amountDue <= 0) {
      continue;
    }

    const existing = grouped.get(invoice.contactName) ?? {
      name: invoice.contactName,
      amountDue: 0,
      billCount: 0,
      overdueCount: 0,
    };

    existing.amountDue += invoice.amountDue;
    existing.billCount += 1;
    if (invoice.isOverdue) {
      existing.overdueCount += 1;
    }

    grouped.set(invoice.contactName, existing);
  }

  return [...grouped.values()].sort((left, right) => right.amountDue - left.amountDue).slice(0, 5);
}

function buildInsights(params: {
  baseCurrency: string | null;
  draftInvoices: number;
  awaitingPayment: number;
  overdueInvoices: InvoiceSnapshot[];
  dueSoonInvoices: InvoiceSnapshot[];
  customerSnapshots: CustomerSnapshot[];
}) {
  const insights: Insight[] = [];
  const overdueAmount = params.overdueInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const dueSoonAmount = params.dueSoonInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const receivablesAmount = params.customerSnapshots.reduce((sum, customer) => sum + customer.amountDue, 0);
  const topCustomer = params.customerSnapshots[0];
  const topCustomerShare = receivablesAmount > 0 && topCustomer ? topCustomer.amountDue / receivablesAmount : 0;

  if (overdueAmount > 0) {
    insights.push({
      id: "overdue",
      tone: "urgent",
      title: `${currency(overdueAmount, params.baseCurrency)} is already overdue`,
      body: `There are ${params.overdueInvoices.length} overdue sales invoices. KISH should start with those before chasing anything else.`,
    });
  }

  if (params.draftInvoices > 0) {
    insights.push({
      id: "drafts",
      tone: "watch",
      title: `${params.draftInvoices} invoices are still in draft`,
      body: "Those invoices are not working for cash flow yet. Reviewing and sending the oldest drafts is one of the fastest wins.",
    });
  }

  if (dueSoonAmount > 0) {
    insights.push({
      id: "due-soon",
      tone: "watch",
      title: `${currency(dueSoonAmount, params.baseCurrency)} is due in the next 7 days`,
      body: "A light-touch reminder sequence now will usually outperform an urgent chase after the due date passes.",
    });
  }

  if (topCustomer && topCustomerShare >= 0.35) {
    insights.push({
      id: "concentration",
      tone: "watch",
      title: `${topCustomer.name} represents ${Math.round(topCustomerShare * 100)}% of open receivables`,
      body: "That makes collections risk a little lopsided. Keep a closer eye on that account and avoid surprise slippage.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "steady",
      tone: "positive",
      title: "Receivables look fairly calm right now",
      body: "There are no obvious pressure points in the current invoice set, so this is a good moment to tighten routines rather than firefight.",
    });
  }

  if (params.awaitingPayment > 0 && insights.length < 4) {
    insights.push({
      id: "awaiting-payment",
      tone: "positive",
      title: `${params.awaitingPayment} invoices are active and awaiting payment`,
      body: "KISH can use this as a working pipeline for reminders, follow-ups, and customer-priority views.",
    });
  }

  return insights.slice(0, 4);
}

function buildAgents(params: {
  baseCurrency: string | null;
  draftInvoices: number;
  overdueInvoices: InvoiceSnapshot[];
  dueSoonInvoices: InvoiceSnapshot[];
  customerSnapshots: CustomerSnapshot[];
}) {
  const agents: AgentSuggestion[] = [];
  const topOverdue = params.overdueInvoices.slice(0, 3);
  const dueSoonTotal = params.dueSoonInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const topCustomer = params.customerSnapshots[0];
  const receivablesAmount = params.customerSnapshots.reduce((sum, customer) => sum + customer.amountDue, 0);
  const concentrationRatio = topCustomer && receivablesAmount > 0 ? topCustomer.amountDue / receivablesAmount : 0;

  if (topOverdue.length > 0) {
    agents.push({
      id: "collections-sweep",
      title: "Collections sweep",
      summary: `Start with ${topOverdue[0].contactName} and clear the oldest overdue invoices first.`,
      actionLabel: "Prepare reminder run",
      checklist: topOverdue.map(
        (invoice) =>
          `${invoice.contactName}: ${invoice.invoiceNumber} is ${invoice.daysOverdue} days overdue for ${currency(invoice.amountDue, params.baseCurrency)}`,
      ),
    });
  }

  if (params.draftInvoices > 0) {
    agents.push({
      id: "draft-push",
      title: "Draft-to-sent push",
      summary: "Turn draft invoices into live receivables before the next cash-flow check-in.",
      actionLabel: "Review drafts",
      checklist: [
        "Sort draft invoices by age and value.",
        "Check missing contact details or line-item issues.",
        "Send the highest-value clean drafts first.",
      ],
    });
  }

  if (params.dueSoonInvoices.length > 0) {
    agents.push({
      id: "soft-reminders",
      title: "Due-soon reminders",
      summary: `${currency(dueSoonTotal, params.baseCurrency)} is due within a week. A soft reminder now can lower late payments.`,
      actionLabel: "Queue gentle nudges",
      checklist: params.dueSoonInvoices.slice(0, 3).map(
        (invoice) => `${invoice.contactName}: remind them about ${invoice.invoiceNumber} before ${invoice.dueDate ?? "its due date"}`,
      ),
    });
  }

  if (topCustomer && concentrationRatio >= 0.35) {
    agents.push({
      id: "concentration-watch",
      title: "Customer concentration watch",
      summary: `${topCustomer.name} is carrying a large share of open receivables.`,
      actionLabel: "Flag account risk",
      checklist: [
        `Review all open invoices for ${topCustomer.name}.`,
        "Check whether upcoming work should stay on standard terms.",
        "Decide whether this account needs a more proactive payment routine.",
      ],
    });
  }

  if (agents.length === 0) {
    agents.push({
      id: "steady-ops",
      title: "Steady-state ops",
      summary: "No major fires right now. Use the breathing room to tighten habits and keep the ledger clean.",
      actionLabel: "Run weekly review",
      checklist: [
        "Check that new invoices are leaving draft promptly.",
        "Confirm large customers are still moving on expected payment dates.",
        "Keep the weekly finance summary short and consistent.",
      ],
    });
  }

  return agents.slice(0, 4);
}

async function fetchAllInvoices(
  api: AccountingInvoicesApi,
  tenantId: string,
  where: string,
  order: string,
) {
  const invoices: InvoiceSummary[] = [];
  let page = 1;

  while (page <= 20) {
    const response = await api.getInvoices(tenantId, undefined, where, order, undefined, undefined, page);
    const batch = response.body.invoices ?? [];

    if (batch.length === 0) {
      break;
    }

    invoices.push(...batch);

    if (batch.length < 100) {
      break;
    }

    page += 1;
  }

  return invoices;
}

async function fetchBankBalance(xero: XeroClient, tenantId: string) {
  try {
    const date = new Date().toISOString().split("T")[0];
    const response = await xero.accountingApi.getReportBankSummary(tenantId, date);
    const rows = response.body.reports?.[0]?.rows ?? [];
    let total = 0;

    for (const row of rows) {
      if (String(row.rowType) !== "Row") {
        continue;
      }

      const cells = row.cells ?? [];
      const balanceCell = cells[cells.length - 1]?.value;
      const parsed = balanceCell ? Number.parseFloat(String(balanceCell).replace(/,/g, "")) : Number.NaN;

      if (!Number.isNaN(parsed)) {
        total += parsed;
      }
    }

    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

export async function getXeroSummary(cookieStore: CookieStoreLike): Promise<SummaryResponse> {
  const config = getXeroConfig();
  const openRouter = getOpenRouterConfig();

  if (!config.isConfigured) {
    return {
      configured: false,
      connected: false,
      error: "Add your Xero client ID, client secret, and redirect URI to start the OAuth flow.",
      openRouter,
    };
  }

  const session = await getAuthenticatedXeroClient(cookieStore);

  if (!session) {
    return {
      configured: true,
      connected: false,
      openRouter,
    };
  }

  try {
    const { xero, tenantId, tenantName } = session;
    const invoicesApi = xero.accountingApi as AccountingInvoicesApi;
    const [organisationsResponse, accountsResponse, receivableRaw, payableRaw, bankBalance] = await Promise.all([
      xero.accountingApi.getOrganisations(tenantId),
      xero.accountingApi.getAccounts(tenantId),
      fetchAllInvoices(invoicesApi, tenantId, 'Type=="ACCREC"', "DueDate ASC"),
      fetchAllInvoices(invoicesApi, tenantId, 'Type=="ACCPAY"', "DueDate ASC"),
      fetchBankBalance(xero, tenantId),
    ]);

    const organisation = organisationsResponse.body.organisations?.[0];
    const accounts = accountsResponse.body.accounts ?? [];
    const baseCurrency = organisation?.baseCurrency ? String(organisation.baseCurrency) : null;
    const receivableInvoices = receivableRaw.map(normaliseInvoice);
    const payableInvoices = payableRaw.map(normaliseInvoice);
    const draftInvoices = receivableInvoices.filter((invoice) => invoice.status === "DRAFT");
    const awaitingPayment = receivableInvoices.filter((invoice) => invoice.status === "AUTHORISED" && invoice.amountDue > 0);
    const overdueInvoices = awaitingPayment.filter((invoice) => invoice.isOverdue).sort((left, right) => right.amountDue - left.amountDue);
    const dueSoonInvoices = awaitingPayment
      .filter((invoice) => {
        if (!invoice.dueDate || invoice.isOverdue) {
          return false;
        }

        const dueDate = new Date(invoice.dueDate);
        const diffDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      })
      .sort((left, right) => left.amountDue - right.amountDue);
    const awaitingBills = payableInvoices
      .filter((invoice) => invoice.status === "AUTHORISED" && invoice.amountDue > 0)
      .sort((left, right) => right.amountDue - left.amountDue);
    const customerSnapshots = buildCustomerSnapshots(awaitingPayment);
    const supplierSnapshots = buildSupplierSnapshots(awaitingBills);
    const receivablesAmount = awaitingPayment.reduce((sum, invoice) => sum + invoice.amountDue, 0);
    const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);
    const dueSoonAmount = dueSoonInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);
    const averageInvoiceValue = awaitingPayment.length > 0 ? receivablesAmount / awaitingPayment.length : 0;
    const insights = buildInsights({
      baseCurrency,
      draftInvoices: draftInvoices.length,
      awaitingPayment: awaitingPayment.length,
      overdueInvoices,
      dueSoonInvoices,
      customerSnapshots,
    });
    const agents = buildAgents({
      baseCurrency,
      draftInvoices: draftInvoices.length,
      overdueInvoices,
      dueSoonInvoices,
      customerSnapshots,
    });

    return {
      configured: true,
      connected: true,
      organisation: {
        id: organisation?.organisationID ?? tenantId,
        name: organisation?.name ?? tenantName,
        legalName: organisation?.legalName ?? null,
        countryCode: organisation?.countryCode ? String(organisation.countryCode) : null,
        baseCurrency,
      },
      tenant: {
        id: tenantId,
        name: tenantName,
      },
      metrics: {
        accounts: accounts.length,
        bankAccounts: accounts.filter((account) => String(account.type) === "BANK").length,
        bankBalance,
        draftInvoices: draftInvoices.length,
        awaitingPayment: awaitingPayment.length,
        overdue: overdueInvoices.length,
        receivablesAmount,
        overdueAmount,
        dueSoonAmount,
        averageInvoiceValue,
      },
      insights,
      agents,
      customers: customerSnapshots,
      suppliers: supplierSnapshots,
      invoices: {
        allReceivables: receivableInvoices,
        allPayables: payableInvoices,
        awaitingPayment: awaitingPayment.slice(0, 25),
        overdue: overdueInvoices.slice(0, 5),
        dueSoon: dueSoonInvoices.slice(0, 5),
        bills: awaitingBills.slice(0, 25),
        drafts: draftInvoices,
      },
      openRouter,
    };
  } catch (error) {
    clearXeroSession(cookieStore);
    return {
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : "The Xero session could not be refreshed.",
      openRouter,
    };
  }
}
