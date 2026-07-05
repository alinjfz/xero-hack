import { Invoice } from "xero-node";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedXeroClient } from "@/lib/xero";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      invoiceId: string;
    }>;
  },
) {
  const cookieStore = await cookies();
  const session = await getAuthenticatedXeroClient(cookieStore);

  if (!session) {
    return NextResponse.json({ error: "Connect Xero first." }, { status: 401 });
  }

  const { invoiceId } = await context.params;

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });
  }

  try {
    await session.xero.accountingApi.updateInvoice(session.tenantId, invoiceId, {
      invoices: [
        {
          invoiceID: invoiceId,
          status: Invoice.StatusEnum.AUTHORISED,
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to authorise invoice in Xero.",
      },
      { status: 500 },
    );
  }
}
