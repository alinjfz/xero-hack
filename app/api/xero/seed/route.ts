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
    console.error("Xero Seed Error:", error);
    let message = "Unable to write starter data into Xero.";
    if (error instanceof Error) {
      message = error.message;
    }
    
    // Extract Xero API validation error details if available
    const xeroError = error as { response?: { body?: unknown } };
    if (xeroError.response?.body) {
      console.error("Xero API Error Details:", JSON.stringify(xeroError.response.body, null, 2));
      try {
        const bodyStr = typeof xeroError.response.body === "string" 
          ? xeroError.response.body 
          : JSON.stringify(xeroError.response.body);
        message += ` (Details: ${bodyStr})`;
      } catch {
        // Fallback
      }
    }

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
