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
      rateLimited?: boolean;
      retryAfter?: number;
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
  date?: string | Date;
  dueDate?: string | Date;
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

type ConnectedSummary = Extract<SummaryResponse, { connected: true }>;

function parseXeroDate(val: string | Date | undefined | null): Date | null {
  if (!val) {
    return null;
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  
  const valStr = String(val).trim();
  const match = /\/Date\((\d+)/.exec(valStr);
  if (match) {
    return new Date(parseInt(match[1], 10));
  }
  
  const parsed = new Date(valStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function normaliseInvoice(invoice: InvoiceSummary): InvoiceSnapshot {
  const now = new Date();
  
  const parsedDueDate = parseXeroDate(invoice.dueDateString ?? invoice.dueDate);
  const parsedIssueDate = parseXeroDate(invoice.dateString ?? invoice.date);
  
  const dueDateStr = parsedDueDate ? parsedDueDate.toISOString().split("T")[0] : null;
  const issueDateStr = parsedIssueDate ? parsedIssueDate.toISOString().split("T")[0] : null;

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
    issueDate: issueDateStr,
    dueDate: dueDateStr,
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

function buildConnectedSummaryFromData(params: {
  tenantId: string;
  tenantName: string;
  organisation: {
    id: string;
    name: string;
    legalName: string | null;
    countryCode: string | null;
    baseCurrency: string | null;
  };
  accountsCount: number;
  bankAccounts: number;
  bankBalance: number | null;
  receivableInvoices: InvoiceSnapshot[];
  payableInvoices: InvoiceSnapshot[];
  openRouter: ReturnType<typeof getOpenRouterConfig>;
}): ConnectedSummary {
  const draftInvoices = params.receivableInvoices.filter((invoice) => invoice.status === "DRAFT");
  const awaitingPayment = params.receivableInvoices.filter((invoice) => invoice.status === "AUTHORISED" && invoice.amountDue > 0);
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
  const awaitingBills = params.payableInvoices
    .filter((invoice) => invoice.status === "AUTHORISED" && invoice.amountDue > 0)
    .sort((left, right) => right.amountDue - left.amountDue);
  const customerSnapshots = buildCustomerSnapshots(awaitingPayment);
  const supplierSnapshots = buildSupplierSnapshots(awaitingBills);
  const receivablesAmount = awaitingPayment.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const dueSoonAmount = dueSoonInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const averageInvoiceValue = awaitingPayment.length > 0 ? receivablesAmount / awaitingPayment.length : 0;
  const insights = buildInsights({
    baseCurrency: params.organisation.baseCurrency,
    draftInvoices: draftInvoices.length,
    awaitingPayment: awaitingPayment.length,
    overdueInvoices,
    dueSoonInvoices,
    customerSnapshots,
  });
  const agents = buildAgents({
    baseCurrency: params.organisation.baseCurrency,
    draftInvoices: draftInvoices.length,
    overdueInvoices,
    dueSoonInvoices,
    customerSnapshots,
  });

  return {
    configured: true,
    connected: true,
    organisation: params.organisation,
    tenant: {
      id: params.tenantId,
      name: params.tenantName,
    },
    metrics: {
      accounts: params.accountsCount,
      bankAccounts: params.bankAccounts,
      bankBalance: params.bankBalance,
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
      allReceivables: params.receivableInvoices,
      allPayables: params.payableInvoices,
      awaitingPayment: awaitingPayment.slice(0, 25),
      overdue: overdueInvoices.slice(0, 5),
      dueSoon: dueSoonInvoices.slice(0, 5),
      bills: awaitingBills.slice(0, 25),
      drafts: draftInvoices,
    },
    openRouter: params.openRouter,
  };
}

function hasMeaningfulLedger(summary: ConnectedSummary) {
  return (
    summary.invoices.allReceivables.length > 0 ||
    summary.invoices.allPayables.length > 0 ||
    summary.metrics.receivablesAmount > 0 ||
    summary.metrics.draftInvoices > 0
  );
}

function isoDateFromOffset(daysOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split("T")[0];
}

function showcaseInvoice(params: {
  invoiceId: string;
  invoiceNumber: string;
  contactName: string;
  reference: string;
  amountDue: number;
  total: number;
  status: string;
  issueOffset: number;
  dueOffset?: number;
}): InvoiceSnapshot {
  const issueDate = isoDateFromOffset(params.issueOffset);
  const dueDate = typeof params.dueOffset === "number" ? isoDateFromOffset(params.dueOffset) : null;
  const parsedDue = dueDate ? new Date(dueDate) : null;
  const now = new Date();
  const isOverdue = Boolean(parsedDue && parsedDue < now && params.amountDue > 0);
  const daysOverdue = parsedDue ? Math.max(0, Math.floor((now.getTime() - parsedDue.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  return {
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber,
    contactName: params.contactName,
    reference: params.reference,
    amountDue: params.amountDue,
    total: params.total,
    currency: "GBP",
    issueDate,
    dueDate,
    status: params.status,
    isOverdue,
    daysOverdue,
  };
}

export function buildShowcaseSummary(openRouter: ReturnType<typeof getOpenRouterConfig>, organisationName = "Demo Company (UK)"): ConnectedSummary {
  const receivableInvoices: InvoiceSnapshot[] = [
    showcaseInvoice({
      invoiceId: "showcase-rent-1",
      invoiceNumber: "INV-1001",
      contactName: "Alex Mercer",
      reference: "Riverside rent - March",
      amountDue: 1200,
      total: 1200,
      status: "AUTHORISED",
      issueOffset: -42,
      dueOffset: -14,
    }),
    showcaseInvoice({
      invoiceId: "showcase-rent-2",
      invoiceNumber: "INV-1002",
      contactName: "Alex Mercer",
      reference: "Riverside rent - April",
      amountDue: 1200,
      total: 1200,
      status: "AUTHORISED",
      issueOffset: -8,
      dueOffset: 2,
    }),
    showcaseInvoice({
      invoiceId: "showcase-rent-3",
      invoiceNumber: "INV-1003",
      contactName: "Alex Mercer",
      reference: "Riverside rent - May draft",
      amountDue: 1200,
      total: 1200,
      status: "DRAFT",
      issueOffset: 0,
    }),
    showcaseInvoice({
      invoiceId: "showcase-cafe-1",
      invoiceNumber: "INV-2001",
      contactName: "Copper Kettle Cafe",
      reference: "Brand refresh sprint",
      amountDue: 0,
      total: 4800,
      status: "PAID",
      issueOffset: -18,
      dueOffset: -4,
    }),
    showcaseInvoice({
      invoiceId: "showcase-northline-1",
      invoiceNumber: "INV-2002",
      contactName: "Northline Studio",
      reference: "Website sprint phase 1",
      amountDue: 2400,
      total: 2400,
      status: "AUTHORISED",
      issueOffset: -6,
      dueOffset: 7,
    }),
    showcaseInvoice({
      invoiceId: "showcase-northline-2",
      invoiceNumber: "INV-2003",
      contactName: "Northline Studio",
      reference: "Logo concept round",
      amountDue: 800,
      total: 800,
      status: "DRAFT",
      issueOffset: -1,
    }),
    showcaseInvoice({
      invoiceId: "showcase-harbour-1",
      invoiceNumber: "INV-2004",
      contactName: "Harbour Retail Group",
      reference: "Seasonal menu rollout",
      amountDue: 3200,
      total: 3200,
      status: "AUTHORISED",
      issueOffset: -10,
      dueOffset: -2,
    }),
    showcaseInvoice({
      invoiceId: "showcase-maple-1",
      invoiceNumber: "INV-2005",
      contactName: "Maple Market",
      reference: "Summer window campaign",
      amountDue: 1850,
      total: 1850,
      status: "AUTHORISED",
      issueOffset: -3,
      dueOffset: 4,
    }),
    showcaseInvoice({
      invoiceId: "showcase-brightideas-1",
      invoiceNumber: "INV-2006",
      contactName: "Bright Ideas Agency",
      reference: "Creative retainers proposal",
      amountDue: 1450,
      total: 1450,
      status: "DRAFT",
      issueOffset: 0,
    }),
  ];

  const payableInvoices: InvoiceSnapshot[] = [
    showcaseInvoice({
      invoiceId: "showcase-council-1",
      invoiceNumber: "BILL-3001",
      contactName: "City Council",
      reference: "Council tax Q1",
      amountDue: 420,
      total: 420,
      status: "AUTHORISED",
      issueOffset: -7,
      dueOffset: 5,
    }),
    showcaseInvoice({
      invoiceId: "showcase-printco-1",
      invoiceNumber: "BILL-3002",
      contactName: "PrintCo Ltd",
      reference: "Print run - menus and signage",
      amountDue: 1890,
      total: 1890,
      status: "AUTHORISED",
      issueOffset: -3,
      dueOffset: 14,
    }),
    showcaseInvoice({
      invoiceId: "showcase-maint-1",
      invoiceNumber: "BILL-3003",
      contactName: "Greenstone Maintenance",
      reference: "Emergency plumbing callout",
      amountDue: 680,
      total: 680,
      status: "AUTHORISED",
      issueOffset: -6,
      dueOffset: 2,
    }),
    showcaseInvoice({
      invoiceId: "showcase-insurance-1",
      invoiceNumber: "BILL-3004",
      contactName: "Oakwater Insurance",
      reference: "",
      amountDue: 960,
      total: 960,
      status: "AUTHORISED",
      issueOffset: -9,
      dueOffset: 1,
    }),
    showcaseInvoice({
      invoiceId: "showcase-logistics-1",
      invoiceNumber: "BILL-3005",
      contactName: "Granite Logistics",
      reference: "Pop-up delivery support",
      amountDue: 540,
      total: 540,
      status: "AUTHORISED",
      issueOffset: -4,
      dueOffset: 8,
    }),
  ];

  return buildConnectedSummaryFromData({
    tenantId: "showcase-tenant",
    tenantName: "Showcase ledger",
    organisation: {
      id: "showcase-org",
      name: organisationName,
      legalName: `${organisationName} Ltd`,
      countryCode: "GB",
      baseCurrency: "GBP",
    },
    accountsCount: 18,
    bankAccounts: 2,
    bankBalance: 18450,
    receivableInvoices,
    payableInvoices,
    openRouter,
  });
}

export async function getXeroSummary(cookieStore: CookieStoreLike): Promise<SummaryResponse> {
  const config = getXeroConfig();
  const openRouter = getOpenRouterConfig();

  // Check for developer bypass cookie to force showcase mode even when real APIs are rate-limited or disconnected
  const forceShowcase = cookieStore.get("kish_force_showcase")?.value === "true";
  if (forceShowcase) {
    return buildShowcaseSummary(openRouter);
  }

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
    const isShowcaseDisabled = cookieStore.get("kish_showcase_disabled")?.value === "true";
    if (isShowcaseDisabled) {
      return {
        configured: true,
        connected: false,
        openRouter,
      };
    }
    return buildShowcaseSummary(openRouter);
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
    const liveSummary = buildConnectedSummaryFromData({
      tenantId,
      tenantName,
      organisation: {
        id: organisation?.organisationID ?? tenantId,
        name: organisation?.name ?? tenantName,
        legalName: organisation?.legalName ?? null,
        countryCode: organisation?.countryCode ? String(organisation.countryCode) : null,
        baseCurrency,
      },
      accountsCount: accounts.length,
      bankAccounts: accounts.filter((account) => String(account.type) === "BANK").length,
      bankBalance,
      receivableInvoices,
      payableInvoices,
      openRouter,
    });

    return liveSummary;
  } catch (error: any) {
    console.error("getXeroSummary error:", error);
    
    const isRateLimited = error.response?.statusCode === 429 || error.statusCode === 429;
    if (isRateLimited) {
      const retryAfterRaw = error.response?.headers?.["retry-after"] || error.headers?.["retry-after"];
      const showcase = buildShowcaseSummary(openRouter);
      return {
        ...showcase,
        rateLimited: true,
        retryAfter: retryAfterRaw ? parseInt(String(retryAfterRaw), 10) : undefined,
      };
    }

    return {
      configured: true,
      connected: false,
      error: getXeroErrorMessage(error),
      openRouter,
    };
  }
}

function getXeroErrorMessage(error: any): string {
  if (!error) return "Unknown error connecting to Xero.";

  try {
    const errStr = typeof error === "string" ? error : JSON.stringify(error);
    
    if (errStr.includes("429") || errStr.includes("rate_limit")) {
      return "Xero API rate limit reached. KISH has paused syncing. Please wait for cooldown.";
    }
    if (errStr.includes("invalid_grant") || errStr.includes("expired") || errStr.includes("token_expired")) {
      return "Your Xero session has expired. Please click disconnect and reconnect.";
    }
    if (errStr.includes("401") || errStr.includes("unauthorized")) {
      return "Authorization failed. Please try reconnecting to your Xero tenant.";
    }
    if (errStr.includes("ENOTFOUND") || errStr.includes("fetch failed") || errStr.includes("ECONNREFUSED")) {
      return "Network connection issue. KISH was unable to reach Xero servers.";
    }
  } catch {}

  // If there's a short response body message, use it
  if (error.response?.body) {
    const body = error.response.body;
    if (typeof body === "object") {
      if (body.Message) return String(body.Message);
      if (body.message) return String(body.message);
    }
  }

  if (error.message) {
    return error.message.length > 80 ? `${error.message.substring(0, 77)}...` : error.message;
  }

  return "Xero connection issue. Please click disconnect and try reconnecting.";
}
