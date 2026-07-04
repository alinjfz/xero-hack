"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Coins,
  House,
  LoaderCircle,
  Mailbox,
  ScrollText,
  Sparkles,
  Star,
  Warehouse,
} from "lucide-react";
import { GoalPicker } from "@/components/world/goal-picker";
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

type SceneId = "outside" | "home" | "biz";
type PanelTarget = "mailbox" | "home-rent" | "home-bills" | "biz-receivables" | "biz-drafts" | "biz-bills" | "biz-revenue";

type SceneHotspot = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  icon: typeof House;
  action:
    | { type: "scene"; scene: SceneId }
    | { type: "panel"; target: PanelTarget };
};

type WorldTask = {
  id: string;
  title: string;
  detail: string;
  location: SceneId;
  xp: number;
  reason: "overdue" | "draft" | "bill" | "goal" | "followup";
};

const SCENE_META: Record<
  SceneId,
  {
    title: string;
    subtitle: string;
    image: string;
  }
> = {
  outside: {
    title: "Overview",
    subtitle: "Step into the exterior and choose which side of the business you want to work on.",
    image: "/world/outside-scene.svg",
  },
  home: {
    title: "House interior",
    subtitle: "Rent, bills, and property cash flow live here.",
    image: "/world/home-interior-scene.svg",
  },
  biz: {
    title: "Business interior",
    subtitle: "Invoices, drafts, supplier bills, and monthly revenue live here.",
    image: "/world/business-interior-scene.svg",
  },
};

const HOTSPOTS: Record<SceneId, SceneHotspot[]> = {
  outside: [
    {
      id: "outside-house",
      label: "House",
      x: 14,
      y: 59,
      width: 20,
      height: 24,
      icon: House,
      action: { type: "scene", scene: "home" },
    },
    {
      id: "outside-mailbox",
      label: "Mailbox",
      x: 27.5,
      y: 60.5,
      width: 7,
      height: 14,
      icon: Mailbox,
      action: { type: "panel", target: "mailbox" },
    },
    {
      id: "outside-business",
      label: "Business",
      x: 50,
      y: 57,
      width: 28,
      height: 24,
      icon: BriefcaseBusiness,
      action: { type: "scene", scene: "biz" },
    },
  ],
  home: [
    {
      id: "home-rent",
      label: "Rent ledger",
      x: 48,
      y: 63,
      width: 18,
      height: 28,
      icon: ScrollText,
      action: { type: "panel", target: "home-rent" },
    },
    {
      id: "home-bills",
      label: "Bills cabinet",
      x: 74,
      y: 61,
      width: 18,
      height: 24,
      icon: Warehouse,
      action: { type: "panel", target: "home-bills" },
    },
  ],
  biz: [
    {
      id: "biz-receivables",
      label: "Invoice counter",
      x: 50,
      y: 63,
      width: 28,
      height: 18,
      icon: Coins,
      action: { type: "panel", target: "biz-receivables" },
    },
    {
      id: "biz-drafts",
      label: "Draft board",
      x: 20,
      y: 60,
      width: 18,
      height: 22,
      icon: ScrollText,
      action: { type: "panel", target: "biz-drafts" },
    },
    {
      id: "biz-bills",
      label: "Supplier shelf",
      x: 80,
      y: 61,
      width: 18,
      height: 24,
      icon: Warehouse,
      action: { type: "panel", target: "biz-bills" },
    },
    {
      id: "biz-revenue",
      label: "Revenue board",
      x: 50,
      y: 18,
      width: 34,
      height: 14,
      icon: Star,
      action: { type: "panel", target: "biz-revenue" },
    },
  ],
};

function isConnectedWorld(
  summary: WorldSummaryResponse | null,
): summary is Extract<WorldSummaryResponse, { connected: true }> {
  return Boolean(summary && summary.connected);
}

function buildPanel(
  summary: Extract<WorldSummaryResponse, { connected: true }>,
  target: PanelTarget,
): DetailPanel {
  const home = summary.worlds.find((world) => world.id === "home")!;
  const biz = summary.worlds.find((world) => world.id === "biz")!;
  const currency = summary.organisation.baseCurrency;

  const panels: Record<PanelTarget, DetailPanel> = {
    mailbox: {
      worldId: "home",
      hotspot: "Mailbox",
      title: "Due soon and overdue",
      subtitle: "What needs a reminder before cash slips further",
      invoices: [...home.overdue, ...home.dueSoon, ...biz.overdue, ...biz.dueSoon],
      currency,
    },
    "home-rent": {
      worldId: "home",
      hotspot: "Rent ledger",
      title: "Rent status",
      subtitle: "Open rent invoices and late rent",
      invoices: [...home.receivables, ...home.overdue],
      currency,
    },
    "home-bills": {
      worldId: "home",
      hotspot: "Bills cabinet",
      title: "Property bills",
      subtitle: "Incoming costs for the property side",
      invoices: home.payables,
      currency,
    },
    "biz-receivables": {
      worldId: "biz",
      hotspot: "Invoice counter",
      title: "Open receivables",
      subtitle: "Client invoices still awaiting payment",
      invoices: biz.receivables,
      currency,
    },
    "biz-drafts": {
      worldId: "biz",
      hotspot: "Draft board",
      title: "Draft invoices",
      subtitle: "Items ready to turn into live receivables",
      invoices: biz.drafts,
      currency,
    },
    "biz-bills": {
      worldId: "biz",
      hotspot: "Supplier shelf",
      title: "Supplier bills",
      subtitle: "Bills the business still needs to handle",
      invoices: biz.payables,
      currency,
    },
    "biz-revenue": {
      worldId: "biz",
      hotspot: "Revenue board",
      title: "Revenue this month",
      subtitle: formatCurrency(biz.metrics.revenueThisMonth, currency),
      invoices: biz.receivables,
      currency,
    },
  };

  return panels[target];
}

function sceneTaskLabel(location: SceneId) {
  if (location === "home") {
    return "House";
  }

  if (location === "biz") {
    return "Business";
  }

  return "Overview";
}

function PanelShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <section className="world-panel-shell rounded-[26px] p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--world-muted)]">{eyebrow}</p>
      <h2 className="mt-1 font-[family-name:var(--font-display)] text-[1.15rem] text-[color:var(--world-ink)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "danger";
}) {
  const toneClass =
    tone === "accent"
      ? "border-[color:var(--world-accent-soft)] bg-[rgba(246,200,90,0.12)]"
      : tone === "danger"
        ? "border-[rgba(245,110,76,0.4)] bg-[rgba(245,110,76,0.12)]"
        : "border-[color:var(--world-border)] bg-[color:var(--world-card)]";

  return (
    <div className={`rounded-[18px] border px-3 py-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--world-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--world-ink)]">{value}</p>
    </div>
  );
}

function describeProgress(
  progress: ReturnType<typeof computeGoalProgress>,
  currency: string | null,
) {
  if (progress.target === 0) {
    return `${progress.current} overdue item${progress.current === 1 ? "" : "s"} left`;
  }

  if (progress.target === 100 && progress.current <= 100) {
    return `${progress.current}% on track`;
  }

  return formatCurrency(progress.current, currency);
}

export function WorldView() {
  const [summary, setSummary] = useState<WorldSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<DetailPanel | null>(null);
  const [goal, setGoal] = useState<ActiveGoal | null>(() => loadActiveGoal());
  const [streak, setStreak] = useState(() => loadStreakState());
  const [scene, setScene] = useState<SceneId>("outside");
  const [tasks, setTasks] = useState<WorldTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [earnedXp, setEarnedXp] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [summaryResponse, tasksResponse] = await Promise.all([
          fetch("/api/world/summary", { credentials: "include", cache: "no-store" }),
          fetch("/api/world/tasks", { credentials: "include", cache: "no-store" }),
        ]);
        const summaryData = (await summaryResponse.json()) as WorldSummaryResponse;
        const tasksData = (await tasksResponse.json().catch(() => ({ tasks: [] }))) as { tasks?: WorldTask[] };

        if (!cancelled) {
          setSummary(summaryData);
          setTasks(tasksData.tasks ?? []);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTasksLoading(false);
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

  const tip = useMemo(() => {
    if (!isConnectedWorld(summary)) {
      return "Connect Xero and load records into the tenant to bring this interface to life.";
    }

    return pickMascotTip({
      summary,
      goal,
      resolvedCount: resolvedIds.length,
    });
  }, [summary, goal, resolvedIds.length]);

  const atRisk = isStreakAtRisk();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="size-7 animate-spin text-[color:var(--world-accent-2)]" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="world-panel-shell max-w-xl rounded-[30px] p-8 text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-[22px] border border-[color:var(--world-border)] bg-[color:var(--world-card)]">
            <Image src="/world/guide-portrait.svg" alt="Guide portrait" width={72} height={72} />
          </div>
          <h1 className="mt-5 font-[family-name:var(--font-display)] text-4xl text-[color:var(--world-ink)]">
            Connect Xero to begin
          </h1>
          <p className="mt-3 text-sm leading-7 text-[color:var(--world-muted)]">
            Authorise a tenant, load records into Xero, then come back here to work from live data.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild className="rounded-[16px] bg-[color:var(--world-accent)] text-[#1d140d] hover:bg-[color:var(--world-accent-2)]">
              <Link href="/">Back to dashboard</Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="rounded-[16px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] text-[color:var(--world-ink)] hover:bg-[color:var(--world-panel)]"
            >
              <Link href="/api/xero/connect">Connect Xero</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const home = summary.worlds.find((world) => world.id === "home")!;
  const biz = summary.worlds.find((world) => world.id === "biz")!;
  const connectedSummary = summary;
  const sceneTasks = tasks.filter((task) => task.location === scene || task.location === "outside");
  const progress = computeGoalProgress(goal, summary);
  const sceneMeta = SCENE_META[scene];
  const totalReceivables = home.metrics.receivables + biz.metrics.receivables;
  const currentHealth = summary.worlds.some((world) => world.health === "stormy")
    ? "stormy"
    : summary.worlds.some((world) => world.health === "cloudy")
      ? "cloudy"
      : "sunny";
  const totalXp = Math.round(progress.percent * 5 + streak.count * 35 + earnedXp);
  const level = Math.max(1, Math.floor(totalXp / 300) + 1);
  const levelProgress = totalXp % 300;

  function handleResolveTask(task: WorldTask) {
    if (completedTaskIds.includes(task.id)) {
      return;
    }

    setCompletedTaskIds((current) => [...current, task.id]);
    setEarnedXp((current) => current + task.xp);
    const next = recordStreakAction("progress");
    setStreak(next);
  }

  function handleHotspot(hotspot: SceneHotspot) {
    if (hotspot.action.type === "scene") {
      setScene(hotspot.action.scene);
      setPanel(null);
      return;
    }

    setPanel(buildPanel(connectedSummary, hotspot.action.target));
  }

  function sceneSummaryValue() {
    if (scene === "home") {
      return formatCurrency(home.metrics.receivables, connectedSummary.organisation.baseCurrency);
    }

    if (scene === "biz") {
      return formatCurrency(biz.metrics.receivables, connectedSummary.organisation.baseCurrency);
    }

    return formatCurrency(totalReceivables, connectedSummary.organisation.baseCurrency);
  }

  return (
    <div className="world-game-shell relative min-h-screen overflow-hidden">
      <div className="world-grid-fade pointer-events-none absolute inset-0" />
      <div className="world-glow-orb pointer-events-none absolute -left-24 top-16" />
      <div className="world-glow-orb world-glow-orb-delayed pointer-events-none absolute right-0 top-1/3" />

      <div className="relative z-10 flex min-h-screen flex-col p-3 sm:p-4 lg:p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="rounded-[14px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] text-[color:var(--world-ink)] hover:bg-[color:var(--world-panel)]"
            >
              <Link href="/">
                <ArrowLeft className="size-4" />
                Dashboard
              </Link>
            </Button>
            <div className="rounded-[16px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-2">
              <p className="text-sm font-semibold text-[color:var(--world-ink)]">{summary.organisation.name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="world-level-pill">
              <Star className="size-4" />
              Level {level}
            </div>
            <div className="world-level-pill world-level-pill-alt">
              <Sparkles className="size-4" />
              {totalXp} XP
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <div className="order-2 space-y-4 xl:order-1">
            <PanelShell eyebrow="Guide" title="Ledger sparrow">
              <div className="flex gap-3">
                <div className="shrink-0 rounded-[18px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] p-2">
                  <Image src="/world/guide-portrait.svg" alt="Guide portrait" width={74} height={74} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-[color:var(--world-ink)]">{tip}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatChip label="Weather" value={currentHealth} tone={currentHealth === "stormy" ? "danger" : "accent"} />
                    <StatChip label="Streak" value={`${streak.count} days`} tone={atRisk ? "danger" : "default"} />
                  </div>
                </div>
              </div>
            </PanelShell>

            <PanelShell eyebrow="Goal" title={progress.label}>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[color:var(--world-ink)]">
                      {describeProgress(progress, summary.organisation.baseCurrency)}
                    </p>
                    <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--world-muted)]">
                      {progress.percent}% complete
                    </p>
                  </div>
                  <div className="mt-3 h-4 overflow-hidden rounded-full border border-[color:var(--world-border)] bg-[color:var(--world-panel)]">
                    <div className="world-progress-fill h-full" style={{ width: `${progress.percent}%` }} />
                  </div>
                </div>
                <GoalPicker
                  bankBalanceAvailable={summary.combined.bankBalance !== null}
                  currency={summary.organisation.baseCurrency}
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
              </div>
            </PanelShell>
          </div>

          <div className="order-1 flex min-h-[420px] flex-col xl:order-2">
            <div className="world-panel-shell flex-1 rounded-[30px] p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--world-muted)]">{sceneMeta.title}</p>
                  <h1 className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--world-ink)] sm:text-3xl">
                    {scene === "outside" ? "Walk the exterior and enter a space" : sceneMeta.title}
                  </h1>
                  <p className="mt-1 text-sm text-[color:var(--world-muted)]">{sceneMeta.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {scene !== "outside" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setScene("outside")}
                      className="rounded-[14px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] text-[color:var(--world-ink)]"
                    >
                      Back outside
                    </Button>
                  ) : null}
                  <StatChip
                    label={scene === "home" ? "Rent open" : scene === "biz" ? "Invoices open" : "Open due"}
                    value={sceneSummaryValue()}
                    tone={scene === "outside" && summary.combined.overdueCount > 0 ? "danger" : "accent"}
                  />
                </div>
              </div>

              <div className="world-map-frame relative overflow-hidden rounded-[26px] border border-[color:var(--world-border)]">
                <div className="world-map-inner relative aspect-[16/10] min-h-[420px] w-full">
                  <Image
                    src={sceneMeta.image}
                    alt={sceneMeta.title}
                    fill
                    priority
                    className="object-cover object-center"
                  />
                  {scene === "outside" ? (
                    <>
                      <div className="world-cloud world-cloud-one pointer-events-none absolute left-[10%] top-[10%] h-8 w-16 rounded-full bg-white/65" />
                      <div className="world-cloud world-cloud-two pointer-events-none absolute right-[16%] top-[14%] h-10 w-20 rounded-full bg-white/50" />
                      <div className="world-water-glint pointer-events-none absolute bottom-[18%] right-[14%] h-10 w-32" />
                    </>
                  ) : null}
                  {scene === "home" ? <div className="world-smoke pointer-events-none absolute left-[48%] top-[14%] h-10 w-4" /> : null}

                  {HOTSPOTS[scene].map((hotspot) => {
                    const Icon = hotspot.icon;

                    return (
                      <button
                        key={hotspot.id}
                        type="button"
                        onClick={() => handleHotspot(hotspot)}
                        className="world-hotspot group absolute"
                        style={{
                          left: `${hotspot.x}%`,
                          top: `${hotspot.y}%`,
                          width: `${hotspot.width}%`,
                          height: `${hotspot.height}%`,
                        }}
                      >
                        <span className="world-hotspot-ring" />
                        <span className="world-hotspot-pill">
                          <Icon className="size-3.5" />
                          {hotspot.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="order-3 space-y-4">
            <PanelShell eyebrow="Tasks" title="AI action list">
              <div className="space-y-3">
                {tasksLoading ? (
                  <div className="rounded-[18px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-4 text-sm text-[color:var(--world-muted)]">
                    Loading tasks...
                  </div>
                ) : (
                  sceneTasks.map((task) => {
                    const done = completedTaskIds.includes(task.id);

                    return (
                      <div
                        key={task.id}
                        className={`rounded-[18px] border px-4 py-4 ${
                          done
                            ? "border-[color:var(--world-accent-soft)] bg-[rgba(246,200,90,0.12)]"
                            : "border-[color:var(--world-border)] bg-[color:var(--world-card)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[color:var(--world-ink)]">{task.title}</p>
                            <p className="mt-1 text-xs leading-6 text-[color:var(--world-muted)]">{task.detail}</p>
                            <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[color:var(--world-muted)]">
                              {sceneTaskLabel(task.location)} · {task.xp} XP
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleResolveTask(task)}
                            disabled={done}
                            className="rounded-[12px] border border-[color:var(--world-border)] bg-[color:var(--world-panel)] px-3 py-2 text-xs font-semibold text-[color:var(--world-ink)] transition hover:border-[color:var(--world-accent-soft)] hover:bg-[color:var(--world-card-strong)] disabled:opacity-55"
                          >
                            {done ? "Done" : "Complete"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </PanelShell>

            <PanelShell eyebrow="Progression" title="Reward track">
              <div className="space-y-3">
                <div className="rounded-[18px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--world-ink)]">XP toward next level</p>
                      <p className="text-xs text-[color:var(--world-muted)]">{levelProgress} / 300 XP</p>
                    </div>
                    <Image src="/world/chest-badge.svg" alt="Reward chest badge" width={44} height={44} />
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-[color:var(--world-panel)]">
                    <div className="world-progress-fill h-full" style={{ width: `${(levelProgress / 300) * 100}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <StatChip label="Earned XP" value={String(earnedXp)} tone="accent" />
                  <StatChip label="Overdue" value={String(summary.combined.overdueCount)} tone={summary.combined.overdueCount > 0 ? "danger" : "default"} />
                </div>
                <StatChip label="Bank" value={formatCurrency(summary.combined.bankBalance ?? 0, summary.organisation.baseCurrency)} tone="accent" />
              </div>
            </PanelShell>
          </div>
        </div>
      </div>

      <WorldDetailSheet panel={panel} onClose={() => setPanel(null)} />
    </div>
  );
}
