import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOpenRouterConfig, generateOpenRouterBrief } from "@/lib/openrouter";
import { getXeroSummary } from "@/lib/xero-summary";

export async function POST() {
  const config = getOpenRouterConfig();

  if (!config.configured || !config.apiKey || !config.model) {
    return NextResponse.json({ error: "OpenRouter is not configured." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const summary = await getXeroSummary(cookieStore);

  if (!summary.configured || !summary.connected) {
    return NextResponse.json({ error: "Xero is not connected." }, { status: 400 });
  }

  const brief = await generateOpenRouterBrief({
    apiKey: config.apiKey,
    model: config.model,
    siteName: "KISH",
    siteUrl: process.env.OPENROUTER_SITE_URL,
    summary: {
      organisation: summary.organisation,
      metrics: summary.metrics,
      insights: summary.insights,
      agents: summary.agents,
      customers: summary.customers,
    },
  });

  return NextResponse.json(
    {
      brief,
      model: config.model,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
