import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resetBrowserDemoData, seedBrowserDemoData } from "@/lib/xero-seed";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      resetFirst?: boolean;
      resetOnly?: boolean;
    };
    const cookieStore = await cookies();

    let removed = 0;

    if (body.resetFirst || body.resetOnly) {
      removed = await resetBrowserDemoData(cookieStore);
    }

    if (body.resetOnly) {
      return NextResponse.json({
        removed,
        created: [],
      });
    }

    const created = await seedBrowserDemoData(cookieStore);

    return NextResponse.json({
      removed,
      created,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to write starter data into Xero.",
      },
      { status: 500 },
    );
  }
}
