import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildOperationsBoard } from "@/lib/operations-board";
import { getOpenRouterConfig } from "@/lib/openrouter";
import { getWorldSummary } from "@/lib/world-summary";

type GoalSuggestion = {
  type: "revenue_target" | "zero_overdue" | "cash_buffer" | "rent_collected" | "custom";
  label: string;
  target: number;
  rationale: string;
};

function fallbackSuggestions(summary: Extract<Awaited<ReturnType<typeof getWorldSummary>>, { connected: true }>) {
  const board = buildOperationsBoard(summary);
  const home = summary.worlds.find((world) => world.id === "home")!;
  const biz = summary.worlds.find((world) => world.id === "biz")!;

  const suggestions: GoalSuggestion[] = [
    {
      type: "rent_collected",
      label: "Collect rent on time",
      target: 100,
      rationale: `House side has ${home.overdue.length} overdue rent items and ${home.drafts.length} draft rent items ready to turn into action.`,
    },
    {
      type: "zero_overdue",
      label: "Clear overdue invoices first",
      target: 0,
      rationale: `${summary.combined.overdueCount} overdue items are dragging collections and should be cleared before anything else.`,
    },
    {
      type: "revenue_target",
      label: "Push this month's revenue higher",
      target: Math.max(5000, Math.ceil((biz.metrics.revenueThisMonth + biz.metrics.receivables) / 1000) * 1000),
      rationale: `${board.invoiceAssistant.length} draft or send-ready items can be used to accelerate live revenue.`,
    },
  ];

  if (summary.combined.bankBalance !== null) {
    suggestions.push({
      type: "cash_buffer",
      label: "Protect the cash buffer",
      target: Math.max(10000, Math.ceil((summary.combined.bankBalance + biz.metrics.billsDue + home.metrics.billsDue) / 1000) * 1000),
      rationale: `Open supplier bills and property costs mean cash discipline should stay visible alongside revenue work.`,
    } as GoalSuggestion);
  }

  return suggestions.slice(0, 4);
}

export async function GET() {
  const cookieStore = await cookies();
  const summary = await getWorldSummary(cookieStore);

  if (!summary.connected) {
    return NextResponse.json({ error: "Xero is not connected." }, { status: 400 });
  }

  const config = getOpenRouterConfig();
  const fallback = fallbackSuggestions(summary);

  if (!config.configured || !config.apiKey || !config.model) {
    return NextResponse.json({ suggestions: fallback }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const compact = {
      organisation: summary.organisation.name,
      currency: summary.organisation.baseCurrency,
      bankBalance: summary.combined.bankBalance,
      overdueCount: summary.combined.overdueCount,
      home: summary.worlds.find((world) => world.id === "home"),
      biz: summary.worlds.find((world) => world.id === "biz"),
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "KISH",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You suggest practical business goals from a Xero snapshot. Return JSON only with key suggestions. Each suggestion must have type, label, target, rationale. Valid types: revenue_target, zero_overdue, cash_buffer, rent_collected.",
          },
          {
            role: "user",
            content: `Suggest up to 4 goals grounded in this data:\n${JSON.stringify(compact)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ suggestions: fallback }, { headers: { "Cache-Control": "no-store" } });
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json({ suggestions: fallback }, { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = JSON.parse(raw) as { suggestions?: GoalSuggestion[] };
    return NextResponse.json({ suggestions: parsed.suggestions?.length ? parsed.suggestions.slice(0, 4) : fallback }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ suggestions: fallback }, { headers: { "Cache-Control": "no-store" } });
  }
}
