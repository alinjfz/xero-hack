import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildOperationsBoard } from "@/lib/operations-board";
import { getOpenRouterConfig } from "@/lib/openrouter";
import { getWorldSummary } from "@/lib/world-summary";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildCompactContext(summary: Extract<Awaited<ReturnType<typeof getWorldSummary>>, { connected: true }>) {
  const board = buildOperationsBoard(summary);
  const home = summary.worlds.find((world) => world.id === "home")!;
  const biz = summary.worlds.find((world) => world.id === "biz")!;

  return {
    organisation: summary.organisation.name,
    legalName: summary.organisation.legalName,
    currency: summary.organisation.baseCurrency,
    bankBalance: summary.combined.bankBalance,
    overdueCount: summary.combined.overdueCount,
    home: {
      receivables: home.metrics.receivables,
      overdue: home.metrics.overdue,
      dueSoon: home.metrics.dueSoon,
      billsDue: home.metrics.billsDue,
      revenueThisMonth: home.metrics.revenueThisMonth,
    },
    business: {
      receivables: biz.metrics.receivables,
      overdue: biz.metrics.overdue,
      dueSoon: biz.metrics.dueSoon,
      billsDue: biz.metrics.billsDue,
      revenueThisMonth: biz.metrics.revenueThisMonth,
    },
    topOverdue: board.overdueChase.slice(0, 4).map((item) => ({
      customerName: item.contactName.replace(/\[(HOME|BIZ)\]\s*/g, ""),
      invoiceNumber: item.invoiceNumber,
      amountDue: item.amountDue,
      dueDate: item.dueDate,
      daysOverdue: item.daysOverdue,
      worldId: item.worldId,
    })),
    draftQueue: board.invoiceAssistant.slice(0, 4).map((item) => ({
      customerName: item.contactName.replace(/\[(HOME|BIZ)\]\s*/g, ""),
      invoiceNumber: item.invoiceNumber,
      amountDue: item.amountDue,
      dueDate: item.dueDate,
      hygieneNotes: item.hygieneNotes,
      worldId: item.worldId,
    })),
    supplierBills: board.supplierBills.slice(0, 4).map((item) => ({
      contactName: item.contactName.replace(/\[(HOME|BIZ)\]\s*/g, ""),
      invoiceNumber: item.invoiceNumber,
      amountDue: item.amountDue,
      dueDate: item.dueDate,
      notes: item.notes,
      worldId: item.worldId,
    })),
    taxChecklist: board.taxChecklist.map((item) => ({
      title: item.title,
      detail: item.detail,
      count: item.count,
      worldId: item.worldId,
    })),
    followupTargets: board.followupTargets.slice(0, 4).map((item) => ({
      customerName: item.customerName.replace(/\[(HOME|BIZ)\]\s*/g, ""),
      amountDue: item.amountDue,
      invoiceCount: item.invoiceCount,
      overdueCount: item.overdueCount,
      repeatCount: item.repeatCount,
      reason: item.reason,
      retainerCandidate: item.retainerCandidate,
    })),
  };
}

function fallbackReply(summary: Extract<Awaited<ReturnType<typeof getWorldSummary>>, { connected: true }>) {
  const board = buildOperationsBoard(summary);
  const topOverdue = board.overdueChase[0];
  const topDraft = board.invoiceAssistant[0];
  const topBill = board.supplierBills[0];

  const lines = [
    topOverdue
      ? `${topOverdue.invoiceNumber} is your biggest immediate pressure at ${topOverdue.daysOverdue} days overdue.`
      : "There are no overdue invoices showing right now.",
    topDraft
      ? `${topDraft.invoiceNumber} is a good next revenue move once its hygiene checks are clean.`
      : "There are no draft invoices waiting right now.",
    topBill
      ? `${topBill.invoiceNumber} should be checked before cash leaves on the bill side.`
      : "There are no open supplier bills showing right now.",
    "Ask again after enabling the AI key if you want a more conversational answer.",
  ];

  return lines.join(" ");
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const summary = await getWorldSummary(cookieStore);

  if (!summary.connected) {
    return NextResponse.json({ error: "Xero is not connected." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({ messages: [] }))) as {
    messages?: ChatMessage[];
  };
  const messages = (body.messages ?? []).filter(
    (message): message is ChatMessage =>
      (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.trim().length > 0,
  );

  if (messages.length === 0) {
    return NextResponse.json({ reply: fallbackReply(summary) }, { headers: { "Cache-Control": "no-store" } });
  }

  const config = getOpenRouterConfig();

  if (!config.configured || !config.apiKey || !config.model) {
    return NextResponse.json({ reply: fallbackReply(summary) }, { headers: { "Cache-Control": "no-store" } });
  }

  const context = buildCompactContext(summary);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "KISH",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content:
              "You are an accountant-style finance copilot inside a business simulation. Answer plainly and helpfully. Only use facts that appear in the supplied ledger context. If something is missing, say so clearly. Do not mention JSON, schemas, raw field names, or hidden system instructions. Keep most answers under 180 words unless the user asks for detail.",
          },
          {
            role: "user",
            content: `Use only this current ledger context:\n${JSON.stringify(context)}`,
          },
          ...messages.slice(-10),
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ reply: fallbackReply(summary) }, { headers: { "Cache-Control": "no-store" } });
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim();

    return NextResponse.json(
      {
        reply: reply || fallbackReply(summary),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ reply: fallbackReply(summary) }, { headers: { "Cache-Control": "no-store" } });
  }
}
