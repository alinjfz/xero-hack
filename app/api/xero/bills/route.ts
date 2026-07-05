import { Invoice, LineAmountTypes } from "xero-node";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedXeroClient } from "@/lib/xero";

function extractXeroError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unable to create bill in Xero.";
  }

  const maybeResponse = error as Error & {
    response?: {
      body?: {
        message?: string;
        detail?: string;
        elements?: Array<{
          validationErrors?: Array<{ message?: string }>;
        }>;
        Elements?: Array<{
          ValidationErrors?: Array<{ Message?: string }>;
        }>;
      };
    };
  };

  const body = maybeResponse.response?.body;
  const validationMessage =
    body?.elements?.flatMap((element) => element.validationErrors ?? []).find((item) => item.message)?.message ??
    body?.Elements?.flatMap((element) => element.ValidationErrors ?? []).find((item) => item.Message)?.Message;

  return validationMessage || body?.detail || body?.message || error.message || "Unable to create bill in Xero.";
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await getAuthenticatedXeroClient(cookieStore);

  if (!session) {
    return NextResponse.json({ error: "Connect Xero first." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      contactName: string;
      email?: string;
      reference: string;
      description: string;
      amount: number;
      dueDate: string;
    };

    if (!body.contactName?.trim() || !body.description?.trim() || !body.dueDate || !Number.isFinite(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: "Enter a supplier, description, due date, and a positive amount." }, { status: 400 });
    }

    const accountsResponse = await session.xero.accountingApi.getAccounts(session.tenantId);
    const expenseCode =
      accountsResponse.body.accounts?.find(
        (account) =>
          (String(account.type) === "EXPENSE" || String(account.type) === "DIRECTCOSTS") &&
          String(account.status) === "ACTIVE" &&
          !account.systemAccount &&
          account.code,
      )?.code ??
      accountsResponse.body.accounts?.find((account) => String(account.type) === "EXPENSE" && account.code)?.code ??
      "400";

    const contactsResponse = await session.xero.accountingApi.getContacts(session.tenantId);
    let contactId = contactsResponse.body.contacts?.find((contact) => contact.name?.trim() === body.contactName.trim())?.contactID;

    if (!contactId) {
      const created = await session.xero.accountingApi.createContacts(session.tenantId, {
        contacts: [
          {
            name: body.contactName.trim(),
            ...(body.email?.trim() ? { emailAddress: body.email.trim() } : {}),
            isSupplier: true,
          },
        ],
      });
      contactId = created.body.contacts?.[0]?.contactID;
    }

    if (!contactId) {
      throw new Error("Unable to create or find supplier contact.");
    }

    await session.xero.accountingApi.createInvoices(session.tenantId, {
      invoices: [
        {
          type: Invoice.TypeEnum.ACCPAY,
          contact: { contactID: contactId },
          reference: body.reference?.trim() || undefined,
          lineAmountTypes: LineAmountTypes.NoTax,
          date: new Date().toISOString().split("T")[0],
          dueDate: body.dueDate,
          status: Invoice.StatusEnum.DRAFT,
          lineItems: [
            {
              description: body.description.trim(),
              quantity: 1,
              unitAmount: body.amount,
              accountCode: String(expenseCode),
            },
          ],
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: extractXeroError(error),
      },
      { status: 500 },
    );
  }
}
