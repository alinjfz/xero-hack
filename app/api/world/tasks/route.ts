import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/openrouter";
import { getWorldSummary } from "@/lib/world-summary";

type WorldTask = {
  id: string;
  title: string;
  detail: string;
  location: "outside" | "home" | "biz";
  xp: number;
  reason: "overdue" | "draft" | "bill" | "goal" | "followup";
};

function fallbackTasks(summary: Extract<Awaited<ReturnType<typeof getWorldSummary>>, { connected: true }>) {
  const home = summary.worlds.find((world) => world.id === "home")!;
  const biz = summary.worlds.find((world) => world.id === "biz")!;
  const tasks: WorldTask[] = [];

  if (home.overdue[0]) {
    tasks.push({
      id: `task-home-overdue-${home.overdue[0].invoiceId}`,
      title: `Chase ${home.overdue[0].contactName.replace("[HOME] ", "")} for overdue rent`,
      detail: `${home.overdue[0].invoiceNumber} is ${home.overdue[0].daysOverdue} days overdue.`,
      location: "home",
      xp: 90,
      reason: "overdue",
    });
  }

  if (biz.drafts[0]) {
    tasks.push({
      id: `task-biz-draft-${biz.drafts[0].invoiceId}`,
      title: `Send ${biz.drafts[0].invoiceNumber} from drafts`,
      detail: `${biz.drafts[0].contactName.replace("[BIZ] ", "")} has a draft waiting to become live revenue.`,
      location: "biz",
      xp: 70,
      reason: "draft",
    });
  }

  if (biz.payables[0]) {
    tasks.push({
      id: `task-biz-bill-${biz.payables[0].invoiceId}`,
      title: `Review supplier bill ${biz.payables[0].invoiceNumber}`,
      detail: `${biz.payables[0].contactName.replace("[BIZ] ", "")} is due ${biz.payables[0].dueDate ?? "soon"}.`,
      location: "biz",
      xp: 55,
      reason: "bill",
    });
  }

  if (home.dueSoon[0]) {
    tasks.push({
      id: `task-home-followup-${home.dueSoon[0].invoiceId}`,
      title: `Send a reminder before ${home.dueSoon[0].invoiceNumber} slips late`,
      detail: `${home.dueSoon[0].contactName.replace("[HOME] ", "")} is due ${home.dueSoon[0].dueDate ?? "soon"}.`,
      location: "outside",
      xp: 45,
      reason: "followup",
    });
  }

  tasks.push({
    id: "task-goal-progress",
    title: "Advance the current money goal",
    detail: `Move the active target forward using the ${summary.organisation.baseCurrency ?? "GBP"} figures now in Xero.`,
    location: "outside",
    xp: 40,
    reason: "goal",
  });

  return tasks.slice(0, 5);
}

async function aiTasks(summary: Extract<Awaited<ReturnType<typeof getWorldSummary>>, { connected: true }>) {
  const config = getOpenRouterConfig();

  if (!config.configured || !config.apiKey || !config.model) {
    return fallbackTasks(summary);
  }

  const home = summary.worlds.find((world) => world.id === "home");
  const biz = summary.worlds.find((world) => world.id === "biz");
  const compact = {
    organisation: summary.organisation.name,
    baseCurrency: summary.organisation.baseCurrency,
    home: {
      overdue: home?.overdue.slice(0, 2),
      dueSoon: home?.dueSoon.slice(0, 2),
      bills: home?.payables.slice(0, 2),
    },
    biz: {
      overdue: biz?.overdue.slice(0, 2),
      dueSoon: biz?.dueSoon.slice(0, 2),
      drafts: biz?.drafts.slice(0, 2),
      bills: biz?.payables.slice(0, 2),
    },
    agents: summary.agents.slice(0, 4),
    insights: summary.insights.slice(0, 4),
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
            "You are an operations copilot for a finance game interface. Return short, concrete, high-value tasks grounded in the provided Xero snapshot. Prefer actions that directly improve cash collection, remove invoice friction, or reduce near-term risk.",
        },
        {
          role: "user",
          content: `Return JSON with a single key "tasks" containing an array of up to 5 objects. Each object must include: id, title, detail, location, xp, reason. Valid locations are outside, home, biz. Valid reasons are overdue, draft, bill, goal, followup. Keep title under 70 characters and detail under 120 characters.\n\nData:\n${JSON.stringify(compact)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return fallbackTasks(summary);
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
    return fallbackTasks(summary);
  }

  try {
    const parsed = JSON.parse(raw) as { tasks?: WorldTask[] };

    if (!parsed.tasks?.length) {
      return fallbackTasks(summary);
    }

    return parsed.tasks.slice(0, 5).map((task, index) => ({
      id: task.id || `task-${index + 1}`,
      title: task.title,
      detail: task.detail,
      location: task.location,
      xp: Math.max(25, Math.min(120, task.xp)),
      reason: task.reason,
    }));
  } catch {
    return fallbackTasks(summary);
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const summary = await getWorldSummary(cookieStore);

  if (!summary.connected) {
    return NextResponse.json({ error: "Xero is not connected." }, { status: 400 });
  }

  const tasks = await aiTasks(summary);

  return NextResponse.json(
    {
      tasks,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
