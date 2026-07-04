"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, Sparkles } from "lucide-react";
import { AlertCard } from "@/components/world/alert-card";
import { GoalPicker } from "@/components/world/goal-picker";
import { HouseScene, BusinessScene, type HotspotId } from "@/components/world/pixel-scenes";
import { Mascot } from "@/components/world/mascot";
import { StreakCalendar } from "@/components/world/streak-calendar";
import { WorldDetailSheet, type DetailPanel } from "@/components/world/world-detail-sheet";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format-currency";
import {
  computeGoalProgress,
  isStreakAtRisk,
  loadActiveGoal,
  loadStreakState,
  recordStreakAction,
  saveStreakState,
  type ActiveGoal,
} from "@/lib/gamification";
import { pickMascotTip } from "@/lib/mascot-tips";
import type { WorldSummaryResponse } from "@/lib/world-summary";

function isConnectedWorld(
  summary: WorldSummaryResponse | null,
): summary is Extract<WorldSummaryResponse, { connected: true }> {
  return Boolean(summary && summary.connected);
}

function buildPanel(
  summary: Extract<WorldSummaryResponse, { connected: true }>,
  worldId: "home" | "biz",
  hotspot: HotspotId,
): DetailPanel | null {
  const world = summary.worlds.find((entry) => entry.id === worldId);
  if (!world) {
    return null;
  }

  const currency = summary.organisation.baseCurrency;

  const panels: Record<HotspotId, DetailPanel | null> = {
    door: {
      worldId,
      hotspot: "Front door",
      title: "Rent status",
      subtitle: "Who owes what for the property",
      invoices: [...world.receivables, ...world.overdue],
      currency,
    },
    mailbox: {
      worldId,
      hotspot: "Mailbox",
      title: "Overdue & due soon",
      subtitle: "Letters you'd rather not open",
      invoices: [...world.overdue, ...world.dueSoon],
      currency,
    },
    shed: {
      worldId,
      hotspot: "Garden shed",
      title: "Property bills",
      subtitle: "Council tax, maintenance, and upkeep",
      invoices: world.payables,
      currency,
    },
    window: {
      worldId,
      hotspot: "Window",
      title: "Cash in this month",
      subtitle: "Rent and property income",
      invoices: world.receivables.filter((invoice) => invoice.status === "PAID" || invoice.amountDue > 0),
      currency,
    },
    counter: {
      worldId,
      hotspot: "Shop counter",
      title: "Open receivables",
      subtitle: "Client invoices awaiting payment",
      invoices: world.receivables,
      currency,
    },
    office: {
      worldId,
      hotspot: "Back office",
      title: "Draft invoices",
      subtitle: "Ready to send when you are",
      invoices: world.drafts,
      currency,
    },
    delivery: {
      worldId,
      hotspot: "Delivery bay",
      title: "Supplier bills",
      subtitle: "What you owe out",
      invoices: world.payables,
      currency,
    },
    sign: {
      worldId,
      hotspot: "Signboard",
      title: "Revenue this month",
      subtitle: formatCurrency(world.metrics.revenueThisMonth, currency),
      invoices: world.receivables,
      currency,
    },
  };

  return panels[hotspot];
}

export function WorldView() {
  const [summary, setSummary] = useState<WorldSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<DetailPanel | null>(null);
  const [goal, setGoal] = useState<ActiveGoal | null>(() => loadActiveGoal());
  const [streak, setStreak] = useState(() => loadStreakState());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/world/summary", { credentials: "include", cache: "no-store" });
        const data = (await response.json()) as WorldSummaryResponse;
        if (!cancelled) {
          setSummary(data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const connected = isConnectedWorld(summary);
  const resolvedIds = streak.resolvedAlertIds;
  const allAlerts = connected ? summary.worlds.flatMap((world) => world.alerts) : [];

  const tip = useMemo(() => {
    if (!isConnectedWorld(summary)) {
      return "Connect Xero first. I don't do imaginary tenants.";
    }

    return pickMascotTip({
      summary,
      goal,
      resolvedCount: resolvedIds.length,
    });
  }, [summary, goal, resolvedIds.length]);

  const progress = connected ? computeGoalProgress(goal, summary) : null;
  const atRisk = isStreakAtRisk();

  function handleResolve(alertId: string) {
    const next = recordStreakAction("alert", alertId);
    setStreak(next);
  }

  function handleHotspot(worldId: "home" | "biz", hotspot: HotspotId) {
    if (!connected) {
      return;
    }

    const nextPanel = buildPanel(summary, worldId, hotspot);
    setPanel(nextPanel);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[color:var(--world-muted)]">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-3xl border border-[color:var(--world-border)] bg-[color:var(--world-card)] p-8 text-center">
        <Sparkles className="mx-auto size-8 text-[color:var(--world-accent)]" />
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--world-ink)]">Move in when you&apos;re ready</h1>
        <p className="text-sm text-[color:var(--world-muted)]">
          Connect Xero on the main dashboard, seed demo data with the CLI, then come back here.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/api/xero/connect">Connect Xero</Link>
          </Button>
        </div>
      </div>
    );
  }

  const home = summary.worlds.find((world) => world.id === "home")!;
  const biz = summary.worlds.find((world) => world.id === "biz")!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Dashboard
          </Link>
        </Button>
        <p className="text-sm text-[color:var(--world-muted)]">{summary.organisation.name}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Mascot tip={tip} />
        <StreakCalendar count={streak.count} atRisk={atRisk} />
      </div>

      <AlertCard alerts={allAlerts} resolvedIds={resolvedIds} onResolve={handleResolve} />

      <div className="grid gap-6 lg:grid-cols-2">
        <HouseScene world={home} onHotspot={(hotspot) => handleHotspot("home", hotspot)} />
        <BusinessScene world={biz} onHotspot={(hotspot) => handleHotspot("biz", hotspot)} />
      </div>

      <section className="space-y-4 rounded-3xl border border-[color:var(--world-border)] bg-[color:var(--world-card)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--world-muted)]">Your goal</p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--world-ink)]">
              {progress?.label ?? "Pick a goal"}
            </h2>
          </div>
          {progress ? (
            <p className="text-sm font-semibold text-[color:var(--world-accent)]">{progress.percent}%</p>
          ) : null}
        </div>
        {progress ? (
          <div className="h-3 overflow-hidden rounded-full bg-[color:var(--world-panel)]">
            <div
              className="h-full rounded-full bg-[color:var(--world-accent)] transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        ) : null}
        <GoalPicker
          bankBalanceAvailable={summary.combined.bankBalance !== null}
          onGoalChange={(nextGoal) => {
            setGoal(nextGoal);
            const baseline = computeGoalProgress(nextGoal, summary);
            if (baseline.percent > 0) {
              const next = recordStreakAction("progress");
              setStreak(next);
            } else {
              saveStreakState(streak);
            }
          }}
        />
      </section>

      <WorldDetailSheet panel={panel} onClose={() => setPanel(null)} />
    </div>
  );
}
