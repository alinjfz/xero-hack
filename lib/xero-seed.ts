import { Invoice, LineAmountTypes, Phone } from "xero-node";
import { createXeroClient, getAuthenticatedXeroClient, getCliAuthenticatedXeroClient } from "@/lib/xero";
import { isDemoTagged } from "@/lib/world-tags";

type SeedContact = {
  name: string;
  email: string;
  isSupplier?: boolean;
};

type SeedInvoice = {
  reference: string;
  contactName: string;
  description: string;
  amount: number;
  type: "ACCREC" | "ACCPAY";
  status: "DRAFT" | "AUTHORISED" | "PAID";
  dueDate?: string;
  issueDate?: string;
};

export const DEMO_CONTACTS: SeedContact[] = [
  { name: "[HOME] Alex Mercer", email: "alex.mercer@example.com" },
  { name: "[HOME] City Council", email: "council@example.com", isSupplier: true },
  { name: "[BIZ] Bright Cafe", email: "finance@brightcafe.example.com" },
  { name: "[BIZ] Northline Studio", email: "ops@northline.example.com" },
  { name: "[BIZ] PrintCo Ltd", email: "billing@printco.example.com", isSupplier: true },
];

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export const DEMO_INVOICES: SeedInvoice[] = [
  {
    reference: "KISH_DEMO [HOME] Rent Mar",
    contactName: "[HOME] Alex Mercer",
    description: "Monthly rent — March",
    amount: 1200,
    type: "ACCREC",
    status: "AUTHORISED",
    issueDate: daysAgo(44),
    dueDate: daysAgo(14),
  },
  {
    reference: "KISH_DEMO [HOME] Rent Apr",
    contactName: "[HOME] Alex Mercer",
    description: "Monthly rent — April",
    amount: 1200,
    type: "ACCREC",
    status: "AUTHORISED",
    issueDate: daysAgo(10),
    dueDate: daysFromNow(3),
  },
  {
    reference: "KISH_DEMO [BIZ] Brand refresh",
    contactName: "[BIZ] Bright Cafe",
    description: "Brand refresh package",
    amount: 4800,
    type: "ACCREC",
    status: "PAID",
    issueDate: daysAgo(20),
    dueDate: daysAgo(5),
  },
  {
    reference: "KISH_DEMO [BIZ] Website sprint",
    contactName: "[BIZ] Northline Studio",
    description: "Website sprint — phase 1",
    amount: 2400,
    type: "ACCREC",
    status: "AUTHORISED",
    issueDate: daysAgo(5),
    dueDate: daysFromNow(10),
  },
  {
    reference: "KISH_DEMO [BIZ] Logo concepts",
    contactName: "[BIZ] Northline Studio",
    description: "Logo concept round",
    amount: 800,
    type: "ACCREC",
    status: "DRAFT",
    issueDate: daysAgo(1),
  },
  {
    reference: "KISH_DEMO [HOME] Council tax Q1",
    contactName: "[HOME] City Council",
    description: "Council tax Q1",
    amount: 420,
    type: "ACCPAY",
    status: "AUTHORISED",
    issueDate: daysAgo(7),
    dueDate: daysFromNow(5),
  },
  {
    reference: "KISH_DEMO [BIZ] Print run",
    contactName: "[BIZ] PrintCo Ltd",
    description: "Print run — menus and signage",
    amount: 1890,
    type: "ACCPAY",
    status: "AUTHORISED",
    issueDate: daysAgo(3),
    dueDate: daysFromNow(14),
  },
];

type ActiveSession = Awaited<ReturnType<typeof getCliAuthenticatedXeroClient>>;
type BrowserCookieStore = Parameters<typeof getAuthenticatedXeroClient>[0];

async function getAccountCodes(xero: Awaited<ReturnType<typeof createXeroClient>>, tenantId: string) {
  const response = await xero.accountingApi.getAccounts(tenantId);
  const accounts = response.body.accounts ?? [];
  const revenue =
    accounts.find((account) => String(account.type) === "REVENUE" && account.code)?.code ??
    accounts.find((account) => account.code)?.code ??
    "200";
  const expense =
    accounts.find((account) => String(account.type) === "EXPENSE" && account.code)?.code ??
    accounts.find((account) => account.code)?.code ??
    "400";

  return { revenue: String(revenue), expense: String(expense) };
}

async function ensureContacts(
  xero: Awaited<ReturnType<typeof createXeroClient>>,
  tenantId: string,
  contacts: SeedContact[],
) {
  const existingResponse = await xero.accountingApi.getContacts(tenantId);
  const existing = existingResponse.body.contacts ?? [];
  const map = new Map<string, string>();

  for (const contact of existing) {
    if (contact.name && contact.contactID) {
      map.set(contact.name, contact.contactID);
    }
  }

  for (const seed of contacts) {
    if (map.has(seed.name)) {
      continue;
    }

    const created = await xero.accountingApi.createContacts(tenantId, {
      contacts: [
        {
          name: seed.name,
          emailAddress: seed.email,
          isSupplier: seed.isSupplier ?? false,
          phones: [{ phoneType: Phone.PhoneTypeEnum.MOBILE, phoneNumber: "07700900000" }],
        },
      ],
    });

    const createdContact = created.body.contacts?.[0];
    if (createdContact?.name && createdContact.contactID) {
      map.set(createdContact.name, createdContact.contactID);
    }
  }

  return map;
}

function buildInvoicePayload(seed: SeedInvoice, contactId: string, accountCode: string): Invoice {
  const invoice: Invoice = {
    type: seed.type === "ACCREC" ? Invoice.TypeEnum.ACCREC : Invoice.TypeEnum.ACCPAY,
    contact: { contactID: contactId },
    reference: seed.reference,
    lineAmountTypes: LineAmountTypes.Inclusive,
    date: seed.issueDate,
    dueDate: seed.dueDate ?? seed.issueDate,
    lineItems: [
      {
        description: seed.description,
        quantity: 1,
        unitAmount: seed.amount,
        accountCode,
      },
    ],
    status:
      seed.status === "DRAFT"
        ? Invoice.StatusEnum.DRAFT
        : seed.status === "PAID"
          ? Invoice.StatusEnum.AUTHORISED
          : Invoice.StatusEnum.AUTHORISED,
  };

  return invoice;
}

async function markInvoicePaid(
  xero: Awaited<ReturnType<typeof createXeroClient>>,
  tenantId: string,
  invoiceId: string,
) {
  const paymentsResponse = await xero.accountingApi.getPayments(tenantId, undefined, undefined, undefined, 1);
  const accountId = paymentsResponse.body.payments?.[0]?.account?.accountID;

  if (!accountId) {
    return;
  }

  const invoiceResponse = await xero.accountingApi.getInvoice(tenantId, invoiceId);
  const invoice = invoiceResponse.body.invoices?.[0];
  if (!invoice?.total) {
    return;
  }

  await xero.accountingApi.createPayment(tenantId, {
    invoice: { invoiceID: invoiceId },
    account: { accountID: accountId },
    amount: invoice.total,
    date: new Date().toISOString().split("T")[0],
  });
}

async function resetDemoDataForSession(session: ActiveSession) {
  const { xero, tenantId } = session;

  const [receivables, payables] = await Promise.all([
    xero.accountingApi.getInvoices(tenantId, undefined, 'Type=="ACCREC"'),
    xero.accountingApi.getInvoices(tenantId, undefined, 'Type=="ACCPAY"'),
  ]);

  const candidates = [...(receivables.body.invoices ?? []), ...(payables.body.invoices ?? [])].filter((invoice) =>
    isDemoTagged(invoice.reference) || isDemoTagged(invoice.contact?.name),
  );

  for (const invoice of candidates) {
    if (!invoice.invoiceID) {
      continue;
    }

    if (invoice.status === Invoice.StatusEnum.DRAFT) {
      await xero.accountingApi.updateInvoice(tenantId, invoice.invoiceID, {
        invoices: [{ invoiceID: invoice.invoiceID, status: Invoice.StatusEnum.VOIDED }],
      });
      continue;
    }

    await xero.accountingApi.updateInvoice(tenantId, invoice.invoiceID, {
      invoices: [{ invoiceID: invoice.invoiceID, status: Invoice.StatusEnum.VOIDED }],
    });
  }

  return candidates.length;
}

async function seedDemoDataForSession(session: ActiveSession) {
  const { xero, tenantId } = session;
  const { revenue, expense } = await getAccountCodes(xero, tenantId);
  const contacts = await ensureContacts(xero, tenantId, DEMO_CONTACTS);

  const created: string[] = [];

  for (const seed of DEMO_INVOICES) {
    const contactId = contacts.get(seed.contactName);
    if (!contactId) {
      continue;
    }

    const accountCode = seed.type === "ACCREC" ? revenue : expense;
    const response = await xero.accountingApi.createInvoices(tenantId, {
      invoices: [buildInvoicePayload(seed, contactId, accountCode)],
    });

    const invoice = response.body.invoices?.[0];
    if (!invoice?.invoiceID) {
      continue;
    }

    created.push(seed.reference);

    if (seed.status === "PAID") {
      await markInvoicePaid(xero, tenantId, invoice.invoiceID);
    }
  }

  return created;
}

export async function resetDemoData() {
  const session = await getCliAuthenticatedXeroClient();
  return resetDemoDataForSession(session);
}

export async function seedDemoData() {
  const session = await getCliAuthenticatedXeroClient();
  return seedDemoDataForSession(session);
}

export async function resetBrowserDemoData(cookieStore: BrowserCookieStore) {
  const session = await getAuthenticatedXeroClient(cookieStore);

  if (!session) {
    throw new Error("Connect Xero first.");
  }

  return resetDemoDataForSession(session);
}

export async function seedBrowserDemoData(cookieStore: BrowserCookieStore) {
  const session = await getAuthenticatedXeroClient(cookieStore);

  if (!session) {
    throw new Error("Connect Xero first.");
  }

  return seedDemoDataForSession(session);
}
