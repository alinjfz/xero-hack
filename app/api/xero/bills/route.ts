import { Invoice, LineAmountTypes, Phone } from "xero-node";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedXeroClient } from "@/lib/xero";

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

    const accountsResponse = await session.xero.accountingApi.getAccounts(session.tenantId);
    const expenseCode =
      accountsResponse.body.accounts?.find((account) => String(account.type) === "EXPENSE" && account.code)?.code ??
      accountsResponse.body.accounts?.find((account) => account.code)?.code ??
      "400";

    const contactsResponse = await session.xero.accountingApi.getContacts(session.tenantId);
    let contactId = contactsResponse.body.contacts?.find((contact) => contact.name === body.contactName)?.contactID;

    if (!contactId) {
      const created = await session.xero.accountingApi.createContacts(session.tenantId, {
        contacts: [
          {
            name: body.contactName,
            emailAddress: body.email,
            isSupplier: true,
            phones: [{ phoneType: Phone.PhoneTypeEnum.MOBILE, phoneNumber: "07700900000" }],
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
          reference: body.reference,
          lineAmountTypes: LineAmountTypes.Inclusive,
          date: new Date().toISOString().split("T")[0],
          dueDate: body.dueDate,
          status: Invoice.StatusEnum.AUTHORISED,
          lineItems: [
            {
              description: body.description,
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
        error: error instanceof Error ? error.message : "Unable to create bill in Xero.",
      },
      { status: 500 },
    );
  }
}
