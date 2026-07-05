"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  CalendarClock,
  CircleAlert,
  LoaderCircle,
  Mail,
  ReceiptPoundSterling,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Unplug,
  Users2,
  Sliders,
  Flame,
  MessageSquare,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ContractIntelligence } from "@/components/contract-intelligence";
import { CliSeedSetup } from "@/components/cli-seed-setup";
import type { OperationsBoard } from "@/lib/operations-board";
import { SummaryResponse } from "@/lib/xero-summary";
import { loadActiveGoals, saveActiveGoals, GoalType } from "@/lib/gamification";

function isConnectedSummary(
  summary: SummaryResponse | null,
): summary is Extract<SummaryResponse, { connected: true }> {
  return Boolean(summary && summary.connected);
}

function formatCurrency(amount: number, currencyCode: string | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode ?? "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getCustomerCostDefaults(amountDue: number, isOverdue: boolean) {
  return {
    supportHours: Math.min(50, Math.floor((amountDue / 12000) * 10) + 4),
    extraRevisions: Math.min(10, Math.floor((amountDue / 20000) * 2) + 1),
    subcontractorPercent: amountDue > 40000 ? 30 : 15,
    paymentDelayDays: isOverdue ? 40 : 5,
  };
}

const showcaseLeakingCustomers = [
  {
    name: "Acme Corp",
    revenue: 220000,
    trueProfit: 11000,
    margin: 5,
    primaryCulprit: "Support overhead",
    isDemo: true,
  },
  {
    name: "Globex Industries",
    revenue: 85000,
    trueProfit: 15000,
    margin: 17.6,
    primaryCulprit: "Subcontractors",
    isDemo: true,
  },
];

export function XeroDashboard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefModel, setBriefModel] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [showShowcaseLeakage, setShowShowcaseLeakage] = useState(false);
  const [operationsBoard, setOperationsBoard] =
    useState<OperationsBoard | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [outreachDrafts, setOutreachDrafts] = useState<Record<string, string>>(
    {},
  );
  const [loadingOutreach, setLoadingOutreach] = useState<
    Record<string, boolean>
  >({});

  const [customerAiRecs, setCustomerAiRecs] = useState<Record<string, string>>(
    {},
  );
  const [loadingRecs, setLoadingRecs] = useState<Record<string, boolean>>({});
  const [activeModal, setActiveModal] = useState<{
    title: string;
    description?: string;
    children: React.ReactNode;
  } | null>(null);

  const [accountantOpen, setAccountantOpen] = useState(false);
  const [accountantMessages, setAccountantMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [accountantInput, setAccountantInput] = useState("");
  const [accountantLoading, setAccountantLoading] = useState(false);

  function openAccountant() {
    setAccountantOpen(true);
    setAccountantMessages((current) =>
      current.length > 0
        ? current
        : [
            {
              role: "assistant",
              content: buildAccountantGreetingHomepage(),
            },
          ],
    );
  }

  function buildAccountantGreetingHomepage() {
    if (!summary || !isConnectedSummary(summary)) {
      return "Hello! I can help you read your business numbers in plain English. Ask me what to fix first, how cash looks, or what to clean up.";
    }
    const bank = summary.metrics.bankAccounts;
    const receivables = summary.metrics.receivablesAmount;
    const baseCurrency = summary.organisation.baseCurrency || "GBP";
    
    return [
      `I can help you read ${summary.organisation.name}'s numbers in plain English.`,
      `We detected ${bank} connected bank accounts, and business receivables open: ${formatCurrency(receivables, baseCurrency)}.`,
      "Ask me what to fix first, how cash looks, or what to clean up before tax time.",
    ].join(" ");
  }

  const sendAccountantMessage = useEffectEvent(async (messageText?: string) => {
    const text = (messageText ?? accountantInput).trim();

    if (!text || accountantLoading) {
      return;
    }

    const nextMessages = [...accountantMessages, { role: "user" as const, content: text }].slice(-10);
    setAccountantMessages(nextMessages);
    setAccountantInput("");
    setAccountantLoading(true);

    try {
      const response = await fetch("/api/ai/accountant-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          messages: nextMessages,
        }),
      });
      const data = (await response.json()) as { reply?: string };

      if (!response.ok || !data.reply) {
        throw new Error("Unable to reach the accountant.");
      }

      setAccountantMessages((current) => [...current, { role: "assistant", content: data.reply! }]);
    } catch {
      setAccountantMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            "I couldn't answer live just now. Based on your ledger, start with overdue invoices, draft hygiene, and supplier bill review before moving to lower-pressure work.",
        },
      ]);
    } finally {
      setAccountantLoading(false);
    }
  });

  const [goals, setGoals] = useState<any[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setGoals(loadActiveGoals());
    }
  }, []);

  function computeGoalProgressHomepage(g: any) {
    if (!g) {
      return { current: 0, target: 1, percent: 0, label: "Pick a goal to begin" };
    }
    if (!summary || !isConnectedSummary(summary)) {
      return { current: 0, target: 1, percent: 0, label: g.label };
    }

    const baseCurrency = summary.organisation.baseCurrency || "GBP";

    switch (g.type) {
      case "revenue_target": {
        const current = summary.metrics.receivablesAmount ?? 0;
        const percent = g.target > 0 ? Math.min(100, Math.round((current / g.target) * 100)) : 0;
        return { current, target: g.target, percent, label: g.label };
      }
      case "zero_overdue": {
        const current = summary.metrics.overdue;
        const percent = current === 0 ? 100 : Math.max(0, 100 - current * 25);
        return { current, target: 0, percent, label: g.label };
      }
      case "cash_buffer": {
        const current = summary.metrics.bankBalance ?? 0;
        const percent = g.target > 0 ? Math.min(100, Math.round((current / g.target) * 100)) : 0;
        return { current, target: g.target, percent, label: g.label };
      }
      case "rent_collected": {
        return { current: 100, target: 100, percent: 100, label: g.label };
      }
      case "custom":
      default:
        return { current: 50, target: 100, percent: 50, label: g.customText ?? g.label };
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch(`/api/xero/summary?t=${Date.now()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await response.json()) as SummaryResponse;
        if (!cancelled) {
          setSummary(data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const generateBrief = useEffectEvent(async (metricsKey?: string) => {
    setBriefLoading(true);
    setBriefError(null);

    try {
      const response = await fetch("/api/ai/brief", {
        method: "POST",
      });
      const data = (await response.json()) as {
        brief?: string;
        model?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to generate AI brief.");
      }

      const generatedBrief = data.brief ?? "";
      const generatedModel = data.model ?? null;

      setBrief(generatedBrief);
      setBriefModel(generatedModel);

      if (metricsKey) {
        localStorage.setItem("kish_brief_metrics_key", metricsKey);
        localStorage.setItem("kish_brief_content_key", generatedBrief);
        if (generatedModel) {
          localStorage.setItem("kish_brief_model_key", generatedModel);
        }
      }
    } catch (error) {
      setBriefError(
        error instanceof Error ? error.message : "Unable to generate AI brief.",
      );
    } finally {
      setBriefLoading(false);
    }
  });

  // Automate generating or loading cached briefs
  useEffect(() => {
    if (
      loading ||
      !summary ||
      !isConnectedSummary(summary) ||
      !summary.openRouter.configured
    ) {
      return;
    }

    const stateKey = JSON.stringify({
      receivables: summary.metrics.receivablesAmount,
      overdue: summary.metrics.overdueAmount,
      customersCount: summary.customers.length,
      awaitingPayment: summary.metrics.awaitingPayment,
    });

    const cachedMetrics = localStorage.getItem("kish_brief_metrics_key");
    const cachedBrief = localStorage.getItem("kish_brief_content_key");
    const cachedModel = localStorage.getItem("kish_brief_model_key");

    if (cachedMetrics === stateKey && cachedBrief) {
      const timeoutId = window.setTimeout(() => {
        setBrief(cachedBrief);
        setBriefModel(cachedModel);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    } else {
      const timeoutId = window.setTimeout(() => {
        void generateBrief(stateKey);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [loading, summary]);

  useEffect(() => {
    if (loading || !summary || !isConnectedSummary(summary)) {
      return;
    }

    let cancelled = false;

    async function loadOperationsBoard() {
      setOperationsLoading(true);

      try {
        const response = await fetch(`/api/operations/board?t=${Date.now()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await response.json()) as OperationsBoard;

        if (!cancelled) {
          setOperationsBoard(data);
        }
      } finally {
        if (!cancelled) {
          setOperationsLoading(false);
        }
      }
    }

    loadOperationsBoard();

    return () => {
      cancelled = true;
    };
  }, [loading, summary]);

  async function handleDisconnect() {
    setDisconnecting(true);

    try {
      await fetch("/api/xero/disconnect", {
        method: "POST",
      });
      // Refetch the fresh summary to transition the UI into Showcase (Demo) Mode cleanly and stay 100% consistent on refresh!
      const response = await fetch(`/api/xero/summary?t=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json()) as SummaryResponse;
      setSummary(data);
      setBrief(null);
      setBriefModel(null);
    } catch (error) {
      console.error("Error during disconnect refetch:", error);
    } finally {
      setDisconnecting(false);
    }
  }

  const generateProfitabilityRec = useEffectEvent(
    async (customerName: string, revenue: number) => {
      const customer = connected
        ? summary.customers.find((entry) => entry.name === customerName)
        : null;
      const costs = customer
        ? getCustomerCostDefaults(customer.amountDue, customer.overdueCount > 0)
        : {
            supportHours: 8,
            extraRevisions: 2,
            subcontractorPercent: 20,
            paymentDelayDays: 10,
          };

      const supportCost = costs.supportHours * 50;
      const revisionCost = costs.extraRevisions * 200;
      const subcontractorCost = revenue * (costs.subcontractorPercent / 100);
      const paymentLatePenalty = revenue * 0.0005 * costs.paymentDelayDays;

      setLoadingRecs((prev) => ({ ...prev, [customerName]: true }));

      try {
        const response = await fetch("/api/ai/profitability", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerName,
            revenue,
            supportCost,
            revisionCost,
            subcontractorCost,
            paymentLatePenalty,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate playbook.");
        }

        setCustomerAiRecs((prev) => ({
          ...prev,
          [customerName]: data.recommendation,
        }));
      } catch (error) {
        console.error(error);
        setCustomerAiRecs((prev) => ({
          ...prev,
          [customerName]:
            "Unable to analyze. Please configure OpenRouter to enable smart optimizations.",
        }));
      } finally {
        setLoadingRecs((prev) => ({ ...prev, [customerName]: false }));
      }
    },
  );

  async function generateOutreachDraft(
    key: string,
    payload: {
      customerName: string;
      intent: "overdue_followup" | "retainer_pitch" | "check_in";
      context: string[];
    },
  ) {
    setLoadingOutreach((prev) => ({ ...prev, [key]: true }));

    try {
      const response = await fetch("/api/ai/outreach-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        draft?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to generate outreach draft.");
      }

      setOutreachDrafts((prev) => ({
        ...prev,
        [key]: data.draft ?? "",
      }));
    } catch (error) {
      setOutreachDrafts((prev) => ({
        ...prev,
        [key]:
          error instanceof Error
            ? error.message
            : "Unable to generate outreach draft.",
      }));
    } finally {
      setLoadingOutreach((prev) => ({ ...prev, [key]: false }));
    }
  }

  const connected = isConnectedSummary(summary);
  const isShowcase = Boolean(
    summary && summary.connected && summary.tenant.id === "showcase-tenant",
  );
  const currencyCode = connected ? summary.organisation.baseCurrency : null;

  // Find customers with leakage (true margin < 25%)
  const realLeakingCustomers = useMemo(
    () =>
      connected
        ? summary.customers
            .map((customer) => {
              const isOverdue = customer.overdueCount > 0;
              const costs = getCustomerCostDefaults(
                customer.amountDue,
                isOverdue,
              );

              const supportCost = costs.supportHours * 50;
              const revisionCost = costs.extraRevisions * 200;
              const subcontractorCost =
                customer.amountDue * (costs.subcontractorPercent / 100);
              const paymentLatePenalty =
                customer.amountDue * 0.0005 * costs.paymentDelayDays;
              const totalBleed =
                supportCost +
                revisionCost +
                subcontractorCost +
                paymentLatePenalty;
              const trueProfit = customer.amountDue - totalBleed;
              const margin =
                customer.amountDue > 0
                  ? (trueProfit / customer.amountDue) * 100
                  : 0;

              // Identify primary culprit
              const breakdown = [
                { name: "Support overhead", value: supportCost },
                { name: "Scope revisions", value: revisionCost },
                { name: "Subcontractors", value: subcontractorCost },
                { name: "Late payments", value: paymentLatePenalty },
              ].sort((a, b) => b.value - a.value);

              return {
                name: customer.name,
                revenue: customer.amountDue,
                trueProfit,
                margin,
                primaryCulprit: breakdown[0]?.name ?? "Operating overhead",
                isDemo: false,
              };
            })
            .filter((c) => c.margin < 25)
        : [],
    [connected, summary],
  );

  const leakingCustomers = useMemo(
    () =>
      showShowcaseLeakage
        ? [...realLeakingCustomers, ...showcaseLeakingCustomers]
        : realLeakingCustomers,
    [realLeakingCustomers, showShowcaseLeakage],
  );

  // Auto-trigger AI advice for leaking customers at top-level (complying with Rules of Hooks)
  useEffect(() => {
    if (!connected || !summary.openRouter.configured) {
      return;
    }

    leakingCustomers.forEach((c) => {
      if (!customerAiRecs[c.name] && !loadingRecs[c.name]) {
        generateProfitabilityRec(c.name, c.revenue);
      }
    });
  }, [connected, customerAiRecs, leakingCustomers, loadingRecs, summary]);

  const rateLimited = Boolean(
    summary && "rateLimited" in summary && summary.rateLimited,
  );
  const retryAfter =
    summary && "retryAfter" in summary ? summary.retryAfter : undefined;

  const formattedTimeRemaining = useMemo(() => {
    if (!retryAfter) return "soon";
    const hours = Math.floor(retryAfter / 3600);
    const minutes = Math.floor((retryAfter % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, [retryAfter]);

  return (
    <div className="space-y-8">
      {rateLimited ? (
        <div className="relative overflow-hidden rounded-[26px] border border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-amber-500/10 p-6 md:p-8">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-rose-400">
                  Xero API Rate Limit Reached (HTTP 429)
                </p>
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl text-white">
                Showing Showcase numbers during daily limit cooldown
              </h3>
              <p className="max-w-3xl text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                Your connected Xero developer account has reached its daily API
                call quota. KISH has automatically loaded Showcase Mode so you
                can preview all features. Your real live metrics will resume
                loading in{" "}
                <strong className="text-rose-400">
                  {formattedTimeRemaining}
                </strong>
                .
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              className="border-rose-500/20 text-rose-100 hover:bg-rose-500/20 w-fit shrink-0"
              disabled={disconnecting}
            >
              <Unplug className="size-4 mr-2" />
              Disconnect
            </Button>
          </div>
        </div>
      ) : isShowcase ? (
        <div className="relative overflow-hidden rounded-[26px] border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-6 md:p-8">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-amber-400">
                  Showcase & Demo Mode
                </p>
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl text-white">
                Viewing simulated dashboard data
              </h3>
              <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--muted-foreground)]">
                KISH is currently running with simulated demo numbers. To view
                your real live Xero financial metrics, click{" "}
                <strong className="text-white">Connect Xero</strong> below or in
                this card to authorise access to your tenant.
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              className="border-amber-500/20 text-amber-100 hover:bg-amber-500/20 w-fit shrink-0"
            >
              <a href="/api/xero/connect">
                <Unplug className="size-4 mr-2" />
                Connect Real Xero
              </a>
            </Button>
          </div>
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
        <Card className="overflow-hidden">
          <CardHeader className="gap-5 p-8">
            <Badge variant="default" className="w-fit">
              KISH
            </Badge>
            <div className="space-y-3">
              <CardTitle className="max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-none sm:text-5xl">
                Small-business finance, translated into action
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-[color:var(--foreground-soft)]">
                KISH reads live Xero data, turns it into plain-English operating
                signals, and suggests the next few moves that will actually help
                the business.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              {!connected || isShowcase ? (
                <Button asChild variant={isShowcase ? "outline" : "default"}>
                  <a href="/api/xero/connect">
                    Connect Xero
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              ) : null}
              {connected ? (
                <Button asChild variant={isShowcase ? "default" : "outline"}>
                  <a href="/world">
                    Enter your world
                    <Sparkles className="size-4" />
                  </a>
                </Button>
              ) : null}
              {connected ? (
                <Button
                  variant="secondary"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Unplug className="size-4" />
                  )}
                  Disconnect
                </Button>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant={connected ? "success" : "subtle"} className="w-fit">
              {loading ? "Checking" : connected ? "Connected" : "Waiting"}
            </Badge>
            <CardTitle>Today</CardTitle>
            <CardDescription>
              {loading
                ? "Checking the current session and loading the finance snapshot."
                : connected
                  ? summary.insights[0]?.body
                  : summary?.configured
                    ? "The app is ready. Authorise a Xero tenant and KISH will build an operating snapshot."
                    : "Add the Xero environment variables first so the OAuth flow can start."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connected ? (
              <>
                <MetricRow
                  label="Open receivables"
                  value={formatCurrency(
                    summary.metrics.receivablesAmount,
                    currencyCode,
                  )}
                  icon={ReceiptPoundSterling}
                />
                <MetricRow
                  label="Overdue now"
                  value={formatCurrency(
                    summary.metrics.overdueAmount,
                    currencyCode,
                  )}
                  icon={CircleAlert}
                />
                <MetricRow
                  label="Due this week"
                  value={formatCurrency(
                    summary.metrics.dueSoonAmount,
                    currencyCode,
                  )}
                  icon={CalendarClock}
                />
                <MetricRow
                  label="Top customers tracked"
                  value={String(summary.customers.length)}
                  icon={Users2}
                />
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)]">
                The first connected Xero tenant becomes the live data source for
                insights, queues, and AI summaries.
              </div>
            )}
            {summary && "error" in summary && summary.error ? (
              <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50">
                {summary.error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 my-6">
        <Feature
          icon={ReceiptPoundSterling}
          title="Receivables pulse"
          body="Track what is overdue, what is due soon, and which customers are starting to dominate your cash position."
        />
        <Feature
          icon={Bot}
          title="Agent suggestions"
          body="KISH turns raw invoice state into a shortlist of practical next actions instead of dumping tables on you."
        />
        <Feature
          icon={Sparkles}
          title="Profit leakage radar"
          body="Identify which clients are costing you the most in hidden support, revisions, and payment delays."
        />
        <Feature
          icon={Sliders}
          title="Contract intelligence"
          body="Extract terms from real agreements and compare them to live Xero invoices, bills, and renewal timing."
        />
      </div>
      {leakingCustomers.length > 0 ? (
        <section className="grid gap-6">
          <Card className="border border-rose-500/20 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.06),transparent_40%)] p-6 md:p-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="default"
                    className="bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                  >
                    Profit Leakage Alert
                  </Badge>
                  <span className="text-xs text-[color:var(--muted-foreground)] flex items-center gap-1">
                    <Flame className="size-3.5 text-rose-400 animate-pulse" />{" "}
                    Live operational bleed detected
                  </span>
                </div>
                <CardTitle className="text-2xl font-[family-name:var(--font-display)]">
                  Why you are losing money on top accounts
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm text-[color:var(--foreground-soft)]">
                  KISH analyzed your active service delivery metrics against raw
                  Xero contracts. Some top customers are underperforming due to
                  unbilled revisions, subcontractor creep, or support delays.
                </CardDescription>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {leakingCustomers.map((c) => (
                <div
                  key={c.name}
                  className="rounded-2xl border border-white/5 bg-white/[0.01] p-5 space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-white text-base">
                        {c.name}
                      </h4>
                      <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                        Revenue: {formatCurrency(c.revenue, currencyCode)}
                      </p>
                    </div>
                    <Badge
                      variant="subtle"
                      className="bg-rose-500/10 text-rose-300"
                    >
                      {c.margin.toFixed(0)}% Margin
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[color:var(--muted-foreground)]">
                        True Profit:
                      </span>
                      <span className="text-rose-300 font-semibold">
                        {formatCurrency(c.trueProfit, currencyCode)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[color:var(--muted-foreground)]">
                        Primary Bleed:
                      </span>
                      <span className="text-white font-medium">
                        {c.primaryCulprit}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-3">
                    {c.isDemo ? (
                      <div className="text-xs text-[color:var(--foreground-soft)] bg-amber-500/5 rounded-xl border border-amber-500/10 p-3 leading-relaxed">
                        <span className="font-bold text-amber-400 block mb-1">
                          AI Recommendation
                        </span>
                        {c.name === "Acme Corp"
                          ? "Support costs have eaten 95% of your margin due to 120+ unbilled hours. Action: Transition to a retained support tier of £75/hr for hours exceeding 15/month, or raise core pricing by 15% immediately."
                          : "Subcontractor margins are currently set to 30%, which is too high for Globex's volume. Action: Bring core deliverables in-house or renegotiate subcontractor rates down to a 15% cap."}
                      </div>
                    ) : loadingRecs[c.name] ? (
                      <div className="flex items-center gap-2 text-xs text-[color:var(--muted-foreground)] py-1">
                        <LoaderCircle className="size-3.5 animate-spin text-amber-400" />
                        AI compiling optimization guide...
                      </div>
                    ) : customerAiRecs[c.name] ? (
                      <div className="text-xs text-[color:var(--foreground-soft)] bg-amber-500/5 rounded-xl border border-amber-500/10 p-3 leading-relaxed">
                        <span className="font-bold text-amber-400 block mb-1">
                          AI Recommendation
                        </span>
                        {customerAiRecs[c.name]}
                      </div>
                    ) : (
                      <div className="text-xs text-[color:var(--muted-foreground)] py-1">
                        AI Briefing pending OpenRouter connection.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {connected ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-[color:var(--accent)]" />
                  <CardTitle>AI task board</CardTitle>
                </div>
                <CardDescription>
                  Concrete next actions built from live Xero ledger state, with
                  Gmail and workflow handoff built in.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {operationsLoading ? (
                  <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm text-[color:var(--muted-foreground)]">
                    Loading workflow board...
                  </div>
                ) : operationsBoard ? (
                  <>
                    <div className="space-y-4">
                      {operationsBoard.tasks.slice(0, 2).map((task) => (
                        <div
                          key={task.id}
                          className="rounded-2xl border border-white/10 bg-black/10 p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                {task.title}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-[color:var(--foreground-soft)]">
                                {task.detail}
                              </p>
                            </div>
                            <Badge variant="subtle">{task.xp} XP</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    {operationsBoard.tasks.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1.5 h-auto rounded-xl"
                        onClick={() =>
                          setActiveModal({
                            title: "AI task board",
                            description:
                              "Concrete next actions built from live Xero ledger state.",
                            children: (
                              <div className="space-y-4 py-2">
                                {operationsBoard.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div>
                                        <p className="text-sm font-semibold text-white">
                                          {task.title}
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-zinc-300">
                                          {task.detail}
                                        </p>
                                      </div>
                                      <Badge variant="subtle">
                                        {task.xp} XP
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ),
                          })
                        }
                      >
                        + More tasks ({operationsBoard.tasks.length - 2}{" "}
                        remaining)
                      </Button>
                    )}
                  </>
                ) : (
                  <EmptyState copy="No workflow tasks are available yet." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ScrollText className="size-4 text-[color:var(--accent)]" />
                  <CardTitle>Google Sheets handoff</CardTitle>
                </div>
                <CardDescription>
                  Export the live workflow board into Google Sheets for ops
                  review, collaboration, or track 2 demos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-6 text-[color:var(--foreground-soft)]">
                  Download a CSV generated from the same Xero-driven task board,
                  then import it into Google Sheets or open a blank sheet
                  directly.
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <a href="/api/operations/sheets">
                      Download CSV
                      <ArrowRight className="size-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a
                      href="https://docs.google.com/spreadsheets/create"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Google Sheets
                      <ArrowRight className="size-4" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ScrollText className="size-4 text-[color:var(--accent)]" />
                  <CardTitle>Draft-to-sent invoice assistant</CardTitle>
                </div>
                <CardDescription>
                  Review draft hygiene, then open Gmail directly with a
                  customer-ready draft before sending from Xero.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {operationsBoard?.invoiceAssistant.length ? (
                  <>
                    <div className="grid gap-4">
                      {operationsBoard.invoiceAssistant
                        .slice(0, 2)
                        .map((invoice) => (
                          <div
                            key={invoice.invoiceId}
                            className="rounded-2xl border border-white/10 bg-black/10 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                  {invoice.contactName}
                                </p>
                                <p className="mt-1 text-sm text-[color:var(--foreground-soft)]">
                                  {invoice.invoiceNumber} ·{" "}
                                  {formatCurrency(
                                    invoice.amountDue,
                                    currencyCode,
                                  )}
                                </p>
                              </div>
                              <Button asChild size="sm">
                                <a
                                  href={invoice.gmailHref}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Mail className="size-4" />
                                  Open Gmail
                                </a>
                              </Button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {invoice.hygieneNotes.map((note) => (
                                <Badge key={note} variant="subtle">
                                  {note}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                    {operationsBoard.invoiceAssistant.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1.5 h-auto rounded-xl"
                        onClick={() =>
                          setActiveModal({
                            title: "Draft-to-sent invoice assistant",
                            description:
                              "Review draft hygiene, then open Gmail directly with a customer-ready draft.",
                            children: (
                              <div className="grid gap-4 py-2">
                                {operationsBoard.invoiceAssistant.map(
                                  (invoice) => (
                                    <div
                                      key={invoice.invoiceId}
                                      className="rounded-2xl border border-white/10 bg-black/10 p-4"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold text-white">
                                            {invoice.contactName}
                                          </p>
                                          <p className="mt-1 text-sm text-zinc-300">
                                            {invoice.invoiceNumber} ·{" "}
                                            {formatCurrency(
                                              invoice.amountDue,
                                              currencyCode,
                                            )}
                                          </p>
                                        </div>
                                        <Button asChild size="sm">
                                          <a
                                            href={invoice.gmailHref}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <Mail className="size-4" />
                                            Open Gmail
                                          </a>
                                        </Button>
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {invoice.hygieneNotes.map((note) => (
                                          <Badge key={note} variant="subtle">
                                            {note}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            ),
                          })
                        }
                      >
                        + More drafts (
                        {operationsBoard.invoiceAssistant.length - 2} remaining)
                      </Button>
                    )}
                  </>
                ) : (
                  <EmptyState copy="No draft invoices are waiting right now." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CircleAlert className="size-4 text-[color:var(--accent)]" />
                  <CardTitle>Overdue chase workflow</CardTitle>
                </div>
                <CardDescription>
                  Prioritised chase queue with direct Gmail follow-up and
                  AI-written drafts that keep source figures separate.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {operationsBoard?.overdueChase.length ? (
                  operationsBoard.overdueChase.map((invoice) => (
                    <div
                      key={invoice.invoiceId}
                      className="rounded-2xl border border-white/10 bg-black/10 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--foreground)]">
                            {invoice.contactName}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--foreground-soft)]">
                            {invoice.invoiceNumber} ·{" "}
                            {formatCurrency(invoice.amountDue, currencyCode)} ·{" "}
                            {invoice.daysOverdue} days overdue
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button asChild size="sm">
                            <a
                              href={invoice.gmailHref}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Mail className="size-4" />
                              Gmail
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              generateOutreachDraft(invoice.invoiceId, {
                                customerName: invoice.contactName,
                                intent: "overdue_followup",
                                context: [
                                  "The customer has an overdue invoice.",
                                  "The message should request an update and offer to resend details.",
                                  "Keep the tone polite and practical.",
                                ],
                              })
                            }
                            disabled={loadingOutreach[invoice.invoiceId]}
                          >
                            {loadingOutreach[invoice.invoiceId] ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Bot className="size-4" />
                            )}
                            AI draft
                          </Button>
                        </div>
                      </div>
                      {outreachDrafts[invoice.invoiceId] ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-[color:var(--foreground-soft)]">
                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                            AI draft
                          </p>
                          <p>{outreachDrafts[invoice.invoiceId]}</p>
                          <p className="mt-3 text-xs text-[color:var(--muted-foreground)]">
                            Source facts: {invoice.invoiceNumber} ·{" "}
                            {formatCurrency(invoice.amountDue, currencyCode)} ·{" "}
                            {invoice.daysOverdue} days overdue
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <EmptyState copy="No overdue chase items are showing right now." />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Supplier bill review queue</CardTitle>
                <CardDescription>
                  Bills ordered for review so timing, missing references, and
                  due-date risk are easy to spot.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {operationsBoard?.supplierBills.length ? (
                  <>
                    <div className="grid gap-4">
                      {operationsBoard.supplierBills.slice(0, 2).map((bill) => (
                        <div
                          key={bill.invoiceId}
                          className="rounded-2xl border border-white/10 bg-black/10 p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                {bill.contactName}
                              </p>
                              <p className="mt-1 text-sm text-[color:var(--foreground-soft)]">
                                {bill.invoiceNumber} ·{" "}
                                {formatCurrency(bill.amountDue, currencyCode)}
                                {bill.dueDate ? ` · due ${bill.dueDate}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {bill.notes.map((note) => (
                              <Badge key={note} variant="subtle">
                                {note}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {operationsBoard.supplierBills.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1.5 h-auto rounded-xl"
                        onClick={() =>
                          setActiveModal({
                            title: "Supplier bill review queue",
                            description:
                              "Bills ordered for review so timing, missing references, and due-date risk are easy to spot.",
                            children: (
                              <div className="grid gap-4 py-2">
                                {operationsBoard.supplierBills.map((bill) => (
                                  <div
                                    key={bill.invoiceId}
                                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div>
                                        <p className="text-sm font-semibold text-white">
                                          {bill.contactName}
                                        </p>
                                        <p className="mt-1 text-sm text-zinc-300">
                                          {bill.invoiceNumber} ·{" "}
                                          {formatCurrency(
                                            bill.amountDue,
                                            currencyCode,
                                          )}
                                          {bill.dueDate
                                            ? ` · due ${bill.dueDate}`
                                            : ""}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {bill.notes.map((note) => (
                                        <Badge key={note} variant="subtle">
                                          {note}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ),
                          })
                        }
                      >
                        + More bills ({operationsBoard.supplierBills.length - 2}{" "}
                        remaining)
                      </Button>
                    )}
                  </>
                ) : (
                  <EmptyState copy="No supplier bills need review right now." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[color:var(--accent)]" />
                  <CardTitle>Tax prep assistant</CardTitle>
                </div>
                <CardDescription>
                  Pre-filing and accountant-handoff checks based on the Xero
                  data we actually have, without pretending to file tax.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {operationsBoard?.taxChecklist ? (
                  <>
                    <div className="grid gap-4">
                      {operationsBoard.taxChecklist.slice(0, 2).map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-white/10 bg-black/10 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                {item.title}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-[color:var(--foreground-soft)]">
                                {item.detail}
                              </p>
                            </div>
                            <Badge
                              variant={
                                item.status === "ready"
                                  ? "success"
                                  : item.status === "warning"
                                    ? "default"
                                    : "subtle"
                              }
                            >
                              {item.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    {operationsBoard.taxChecklist.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1.5 h-auto rounded-xl"
                        onClick={() =>
                          setActiveModal({
                            title: "Tax prep assistant",
                            description:
                              "Pre-filing and accountant-handoff checks based on the Xero data we actually have.",
                            children: (
                              <div className="grid gap-4 py-2">
                                {operationsBoard.taxChecklist.map((item) => (
                                  <div
                                    key={item.id}
                                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-white">
                                          {item.title}
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-zinc-300">
                                          {item.detail}
                                        </p>
                                      </div>
                                      <Badge
                                        variant={
                                          item.status === "ready"
                                            ? "success"
                                            : item.status === "warning"
                                              ? "default"
                                              : "subtle"
                                        }
                                      >
                                        {item.status}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ),
                          })
                        }
                      >
                        + More checks ({operationsBoard.taxChecklist.length - 2}{" "}
                        remaining)
                      </Button>
                    )}
                  </>
                ) : (
                  <EmptyState copy="No tax checks available." />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Follow-up priority</CardTitle>
                <CardDescription>
                  Clients worth contacting first, ranked from live receivables
                  and repeat-work patterns.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {operationsBoard?.followupTargets.length ? (
                  <>
                    <div className="grid gap-4">
                      {operationsBoard.followupTargets
                        .slice(0, 2)
                        .map((target) => (
                          <div
                            key={target.id}
                            className="rounded-2xl border border-white/10 bg-black/10 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                  {target.customerName}
                                </p>
                                <p className="mt-1 text-sm text-[color:var(--foreground-soft)]">
                                  {formatCurrency(
                                    target.amountDue,
                                    currencyCode,
                                  )}{" "}
                                  open · {target.invoiceCount} invoice
                                  {target.invoiceCount === 1 ? "" : "s"} ·{" "}
                                  {target.repeatCount} total jobs
                                </p>
                                <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                                  {target.reason}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button asChild size="sm">
                                  <a
                                    href={target.gmailHref}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <Mail className="size-4" />
                                    Gmail
                                  </a>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    generateOutreachDraft(target.id, {
                                      customerName: target.customerName,
                                      intent: target.retainerCandidate
                                        ? "retainer_pitch"
                                        : "check_in",
                                      context: [
                                        target.retainerCandidate
                                          ? "The customer shows a repeat-work pattern and may fit a recurring arrangement."
                                          : "The customer is worth a proactive check-in based on open work and payment context.",
                                        "Keep the message short and commercially helpful.",
                                        "Do not include any numbers or dates.",
                                      ],
                                    })
                                  }
                                  disabled={loadingOutreach[target.id]}
                                >
                                  {loadingOutreach[target.id] ? (
                                    <LoaderCircle className="size-4 animate-spin" />
                                  ) : (
                                    <Bot className="size-4" />
                                  )}
                                  AI draft
                                </Button>
                              </div>
                            </div>
                            {outreachDrafts[target.id] ? (
                              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-[color:var(--foreground-soft)]">
                                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                                  AI draft
                                </p>
                                <p>{outreachDrafts[target.id]}</p>
                                <p className="mt-3 text-xs text-[color:var(--muted-foreground)]">
                                  Source facts:{" "}
                                  {formatCurrency(
                                    target.amountDue,
                                    currencyCode,
                                  )}{" "}
                                  open · {target.invoiceCount} open invoices ·{" "}
                                  {target.overdueCount} overdue
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ))}
                    </div>
                    {operationsBoard.followupTargets.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1.5 h-auto rounded-xl"
                        onClick={() =>
                          setActiveModal({
                            title: "Follow-up priority",
                            description:
                              "Clients worth contacting first, ranked from live receivables and repeat-work patterns.",
                            children: (
                              <div className="grid gap-4 py-2">
                                {operationsBoard.followupTargets.map(
                                  (target) => (
                                    <div
                                      key={target.id}
                                      className="rounded-2xl border border-white/15 bg-black/25 p-4 text-left"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold text-white">
                                            {target.customerName}
                                          </p>
                                          <p className="mt-1 text-sm text-zinc-300">
                                            {formatCurrency(
                                              target.amountDue,
                                              currencyCode,
                                            )}{" "}
                                            open · {target.invoiceCount} invoice
                                            {target.invoiceCount === 1
                                              ? ""
                                              : "s"}{" "}
                                            · {target.repeatCount} total jobs
                                          </p>
                                          <p className="mt-2 text-sm leading-6 text-zinc-400">
                                            {target.reason}
                                          </p>
                                        </div>
                                        <div className="flex gap-2">
                                          <Button asChild size="sm">
                                            <a
                                              href={target.gmailHref}
                                              target="_blank"
                                              rel="noreferrer"
                                            >
                                              <Mail className="size-4" />
                                              Gmail
                                            </a>
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() =>
                                              generateOutreachDraft(target.id, {
                                                customerName:
                                                  target.customerName,
                                                intent: target.retainerCandidate
                                                  ? "retainer_pitch"
                                                  : "check_in",
                                                context: [
                                                  target.retainerCandidate
                                                    ? "The customer shows a repeat-work pattern and may fit a recurring arrangement."
                                                    : "The customer is worth a proactive check-in based on open work and payment context.",
                                                  "Keep the message short and commercially helpful.",
                                                  "Do not include any numbers or dates.",
                                                ],
                                              })
                                            }
                                            disabled={
                                              loadingOutreach[target.id]
                                            }
                                          >
                                            {loadingOutreach[target.id] ? (
                                              <LoaderCircle className="size-4 animate-spin" />
                                            ) : (
                                              <Bot className="size-4" />
                                            )}
                                            AI draft
                                          </Button>
                                        </div>
                                      </div>
                                      {outreachDrafts[target.id] ? (
                                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-zinc-300">
                                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                                            AI draft
                                          </p>
                                          <p>{outreachDrafts[target.id]}</p>
                                          <p className="mt-3 text-xs text-zinc-500">
                                            Source facts:{" "}
                                            {formatCurrency(
                                              target.amountDue,
                                              currencyCode,
                                            )}{" "}
                                            open · {target.invoiceCount} open
                                            invoices · {target.overdueCount}{" "}
                                            overdue
                                          </p>
                                        </div>
                                      ) : null}
                                    </div>
                                  ),
                                )}
                              </div>
                            ),
                          })
                        }
                      >
                        + More follow-ups (
                        {operationsBoard.followupTargets.length - 2} remaining)
                      </Button>
                    )}
                  </>
                ) : (
                  <EmptyState copy="No follow-up targets are standing out yet." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Workflow reports</CardTitle>
                <CardDescription>
                  Live snapshots that match the same ledger-derived workflow
                  board used throughout the app.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {operationsBoard?.reports.map((report) => (
                  <div
                    key={report.id}
                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                      {report.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
                      {report.value}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-soft)]">
                      {report.detail}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <ContractIntelligence summary={summary} />

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Signals</CardTitle>
                <CardDescription>
                  What stands out in the current Xero data.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {summary.insights.length > 0 ? (
                  <>
                    <div className="grid gap-4">
                      {summary.insights.slice(0, 2).map((insight) => (
                        <div
                          key={insight.id}
                          className="rounded-2xl border border-white/10 bg-black/10 p-4"
                        >
                          <Badge
                            variant={badgeForTone(insight.tone)}
                            className="mb-3 w-fit"
                          >
                            {insight.tone}
                          </Badge>
                          <p className="text-sm font-semibold text-[color:var(--foreground)]">
                            {insight.title}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-soft)]">
                            {insight.body}
                          </p>
                        </div>
                      ))}
                    </div>
                    {summary.insights.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1.5 h-auto rounded-xl"
                        onClick={() =>
                          setActiveModal({
                            title: "Signals",
                            description:
                              "What stands out in the current Xero data.",
                            children: (
                              <div className="grid gap-4 py-2">
                                {summary.insights.map((insight) => (
                                  <div
                                    key={insight.id}
                                    className="rounded-2xl border border-white/10 bg-black/10 p-4 text-left"
                                  >
                                    <Badge
                                      variant={badgeForTone(insight.tone)}
                                      className="mb-3 w-fit"
                                    >
                                      {insight.tone}
                                    </Badge>
                                    <p className="text-sm font-semibold text-white">
                                      {insight.title}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                                      {insight.body}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ),
                          })
                        }
                      >
                        + More signals ({summary.insights.length - 2} remaining)
                      </Button>
                    )}
                  </>
                ) : (
                  <EmptyState copy="No insights are showing right now." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Agent queue</CardTitle>
                <CardDescription>
                  The next few actions KISH would run or tee up for a finance
                  operator.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {summary.agents.length > 0 ? (
                  <>
                    <div className="grid gap-4">
                      {summary.agents.slice(0, 2).map((agent) => (
                        <div
                          key={agent.id}
                          className="rounded-2xl border border-white/10 bg-black/10 p-4"
                        >
                          <div className="mb-3 flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                {agent.title}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-[color:var(--foreground-soft)]">
                                {agent.summary}
                              </p>
                            </div>
                            <Badge variant="subtle">{agent.actionLabel}</Badge>
                          </div>
                          <div className="space-y-2">
                            {agent.checklist.map((item) => (
                              <p
                                key={item}
                                className="text-sm leading-6 text-[color:var(--muted-foreground)]"
                              >
                                {item}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {summary.agents.length > 2 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1.5 h-auto rounded-xl"
                        onClick={() =>
                          setActiveModal({
                            title: "Agent queue",
                            description:
                              "The next few actions KISH would run or tee up for a finance operator.",
                            children: (
                              <div className="grid gap-4 py-2">
                                {summary.agents.map((agent) => (
                                  <div
                                    key={agent.id}
                                    className="rounded-2xl border border-white/10 bg-black/10 p-4 text-left"
                                  >
                                    <div className="mb-3 flex items-start justify-between gap-4">
                                      <div>
                                        <p className="text-sm font-semibold text-white">
                                          {agent.title}
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-zinc-300">
                                          {agent.summary}
                                        </p>
                                      </div>
                                      <Badge variant="subtle">
                                        {agent.actionLabel}
                                      </Badge>
                                    </div>
                                    <div className="space-y-2">
                                      {agent.checklist.map((item) => (
                                        <p
                                          key={item}
                                          className="text-sm leading-6 text-zinc-400"
                                        >
                                          {item}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ),
                          })
                        }
                      >
                        + More agents ({summary.agents.length - 2} remaining)
                      </Button>
                    )}
                  </>
                ) : (
                  <EmptyState copy="No agent queue active." />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <Card>
              <CardHeader>
                <CardTitle>Receivables watchlist</CardTitle>
                <CardDescription>
                  The customers and invoices most likely to need attention next.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                    Top customers by amount due
                  </p>
                  {summary.customers.length > 0 ? (
                    <>
                      {summary.customers.slice(0, 2).map((customer) => (
                        <div
                          key={customer.name}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                              {customer.name}
                            </p>
                            <p className="text-sm text-[color:var(--muted-foreground)]">
                              {customer.invoiceCount} open invoices,{" "}
                              {customer.overdueCount} overdue
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-[color:var(--foreground)]">
                            {formatCurrency(customer.amountDue, currencyCode)}
                          </p>
                        </div>
                      ))}
                      {summary.customers.length > 2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-fit text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1 rounded-lg justify-start"
                          onClick={() =>
                            setActiveModal({
                              title: "Top customers by amount due",
                              description:
                                "All top customers from the Receivables watchlist.",
                              children: (
                                <div className="space-y-3 py-2">
                                  {summary.customers.map((customer) => (
                                    <div
                                      key={customer.name}
                                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-left"
                                    >
                                      <div>
                                        <p className="text-sm font-semibold text-white">
                                          {customer.name}
                                        </p>
                                        <p className="text-sm text-zinc-400">
                                          {customer.invoiceCount} open invoices,{" "}
                                          {customer.overdueCount} overdue
                                        </p>
                                      </div>
                                      <p className="text-sm font-semibold text-white">
                                        {formatCurrency(
                                          customer.amountDue,
                                          currencyCode,
                                        )}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ),
                            })
                          }
                        >
                          + More customers ({summary.customers.length - 2}{" "}
                          remaining)
                        </Button>
                      )}
                    </>
                  ) : (
                    <EmptyState copy="No open receivables are showing in the current invoice set." />
                  )}
                </div>

                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                    Overdue invoices
                  </p>
                  {summary.invoices.overdue.length > 0 ? (
                    <>
                      {summary.invoices.overdue.slice(0, 2).map((invoice) => (
                        <InvoiceRow
                          key={invoice.invoiceId}
                          invoice={invoice}
                          currencyCode={currencyCode}
                        />
                      ))}
                      {summary.invoices.overdue.length > 2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-fit text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1 rounded-lg justify-start"
                          onClick={() =>
                            setActiveModal({
                              title: "Overdue invoices",
                              description: "All overdue customer invoices.",
                              children: (
                                <div className="space-y-3 py-2">
                                  {summary.invoices.overdue.map((invoice) => (
                                    <InvoiceRow
                                      key={invoice.invoiceId}
                                      invoice={invoice}
                                      currencyCode={currencyCode}
                                    />
                                  ))}
                                </div>
                              ),
                            })
                          }
                        >
                          + More overdue ({summary.invoices.overdue.length - 2}{" "}
                          remaining)
                        </Button>
                      )}
                    </>
                  ) : (
                    <EmptyState copy="No overdue invoices right now." />
                  )}
                </div>

                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                    Supplier bills awaiting payment
                  </p>
                  {summary.invoices.bills.length > 0 ? (
                    <>
                      {summary.invoices.bills.slice(0, 2).map((invoice) => (
                        <InvoiceRow
                          key={invoice.invoiceId}
                          invoice={invoice}
                          currencyCode={currencyCode}
                        />
                      ))}
                      {summary.invoices.bills.length > 2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-fit text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1 rounded-lg justify-start"
                          onClick={() =>
                            setActiveModal({
                              title: "Supplier bills awaiting payment",
                              description: "All open supplier bills.",
                              children: (
                                <div className="space-y-3 py-2">
                                  {summary.invoices.bills.map((invoice) => (
                                    <InvoiceRow
                                      key={invoice.invoiceId}
                                      invoice={invoice}
                                      currencyCode={currencyCode}
                                    />
                                  ))}
                                </div>
                              ),
                            })
                          }
                        >
                          + More bills ({summary.invoices.bills.length - 2}{" "}
                          remaining)
                        </Button>
                      )}
                    </>
                  ) : (
                    <EmptyState copy="No open supplier bills are showing right now." />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI finance brief</CardTitle>
                <CardDescription>
                  {summary.openRouter.configured
                    ? "Automatically compiled on load using client-side caching to optimize API usage."
                    : "Add an OpenRouter key to generate a compact narrative from the Xero snapshot."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {summary.openRouter.configured &&
                summary.openRouter.model &&
                summary.openRouter.model.toLowerCase() !== "openrouter/free" ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                      Model
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--foreground-soft)]">
                      {summary.openRouter.model}
                    </p>
                  </div>
                ) : null}

                {summary.invoices.dueSoon.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                      Due soon
                    </p>
                    <div className="mt-3 space-y-2">
                      {summary.invoices.dueSoon.map((invoice) => (
                        <p
                          key={invoice.invoiceId}
                          className="text-sm leading-6 text-[color:var(--foreground-soft)]"
                        >
                          {invoice.contactName}: {invoice.invoiceNumber} for{" "}
                          {formatCurrency(invoice.amountDue, currencyCode)} due{" "}
                          {invoice.dueDate ?? "soon"}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                {briefError ? (
                  <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50">
                    {briefError}
                  </div>
                ) : null}

                {briefLoading ? (
                  <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-6 text-center space-y-3">
                    <LoaderCircle className="size-6 text-amber-400 animate-spin mx-auto" />
                    <p className="text-sm text-[color:var(--muted-foreground)]">
                      KISH AI is compiling your operating briefing...
                    </p>
                  </div>
                ) : brief ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[color:var(--foreground)]">
                        Latest brief
                      </p>
                      {briefModel &&
                      briefModel.toLowerCase() !== "openrouter/free" ? (
                        <Badge variant="subtle">{briefModel}</Badge>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {renderMarkdown(
                        brief
                          .split("\n")
                          .map((l) => l.trim())
                          .find((line) => {
                            if (!line) return false;
                            if (line.startsWith("#")) return false;
                            if (line.startsWith("-") || line.startsWith("*"))
                              return false;
                            if (/^\d+\./.test(line)) return false;
                            return true;
                          }) || brief,
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit text-xs text-[color:var(--accent)] hover:bg-white/5 px-3 py-1 rounded-lg justify-start mt-1"
                      onClick={() =>
                        setActiveModal({
                          title: "AI finance brief",
                          description:
                            "Automated owner-ready operational briefing.",
                          children: (
                            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-2">
                              {renderMarkdown(brief)}
                            </div>
                          ),
                        })
                      }
                    >
                      + Read full brief
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    Activate OpenRouter to access automated owner-ready
                    operational briefings.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Goals Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle>Active Goals</CardTitle>
                  <CardDescription>
                    Track your business objectives, synchronized with your world.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-[color:var(--accent)] hover:bg-white/5 rounded-lg px-3 py-1"
                  onClick={() =>
                    setActiveModal({
                      title: "Add Active Goal",
                      description: "Select an objective to track. Your progress updates live based on your Xero data.",
                      children: (
                        <div className="space-y-4 py-2 text-left">
                          <p className="text-sm text-[color:var(--muted-foreground)]">
                            Select a core preset or objective. Your progress updates live based on your Xero data.
                          </p>
                          <div className="space-y-2">
                            {[
                              { type: "revenue_target", label: "Monthly Revenue Target (£5k)", defaultTarget: 5000 },
                              { type: "zero_overdue", label: "Clear Overdue Invoices", defaultTarget: 0 },
                              { type: "cash_buffer", label: "Cash Buffer Target (£10k)", defaultTarget: 10000 },
                              { type: "rent_collected", label: "Rent collected on time", defaultTarget: 100 },
                            ].map((preset) => {
                              const isActive = goals.some((g) => g.type === preset.type);
                              return (
                                <button
                                  key={preset.type}
                                  disabled={isActive}
                                  onClick={() => {
                                    const newGoal = {
                                      type: preset.type as GoalType,
                                      label: preset.label,
                                      target: preset.defaultTarget,
                                      setAt: new Date().toISOString(),
                                    };
                                    const nextGoals = [...goals.filter((g) => g.type !== preset.type), newGoal];
                                    saveActiveGoals(nextGoals);
                                    setGoals(nextGoals);
                                    setActiveModal(null);
                                  }}
                                  className={`w-full flex items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
                                    isActive
                                      ? "border-emerald-500/30 bg-emerald-500/5 opacity-60 cursor-not-allowed"
                                      : "border-white/10 bg-white/5 hover:border-amber-500/50"
                                  }`}
                                >
                                  <div>
                                    <p className="text-sm font-semibold text-white">{preset.label}</p>
                                    <p className="text-xs text-[color:var(--muted-foreground)]">
                                      {isActive ? "Already active and tracking" : "Click to activate this objective"}
                                    </p>
                                  </div>
                                  {isActive ? (
                                    <Badge variant="subtle" className="text-emerald-400 bg-emerald-400/5">Active</Badge>
                                  ) : (
                                    <ArrowRight className="size-4 text-amber-400" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )
                    })
                  }
                >
                  Add Goal
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {goals && goals.length > 0 ? (
                  <div className="space-y-3">
                    {goals.map((g) => {
                      const progress = computeGoalProgressHomepage(g);
                      return (
                        <div key={g.setAt} className="rounded-2xl border border-white/10 bg-black/10 p-4 space-y-3 relative group">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold text-white">🏆 {progress.label}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="subtle" className="text-amber-400 font-semibold bg-amber-400/5">
                                {progress.percent}%
                              </Badge>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextGoals = goals.filter((item) => item.setAt !== g.setAt);
                                  saveActiveGoals(nextGoals);
                                  setGoals(nextGoals);
                                }}
                                className="rounded p-1 text-[color:var(--muted-foreground)] hover:bg-white/5 hover:text-red-400 transition"
                                title="Remove Goal"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Beautiful Progress Bar */}
                          <div className="relative h-2 w-full rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500 ease-out"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                          
                          <div className="flex justify-between text-xs text-[color:var(--muted-foreground)]">
                            <span>Current: {g.type === "zero_overdue" ? `${progress.current} overdue` : formatCurrency(progress.current, currencyCode)}</span>
                            <span>Target: {g.type === "zero_overdue" ? "0" : formatCurrency(progress.target, currencyCode)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)] text-center space-y-2">
                    <p>No active goals are currently running.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-[color:var(--accent)] hover:bg-white/5 rounded-lg px-3 py-1"
                      onClick={() =>
                        setActiveModal({
                          title: "Select Active Goal",
                          description: "Choose a target to sync with your gamified board.",
                          children: (
                            <div className="space-y-4 py-2 text-left">
                              <p className="text-sm text-[color:var(--muted-foreground)]">
                                Select a core preset or objective. Your progress updates live based on your Xero data.
                              </p>
                              <div className="space-y-2">
                                {[
                                  { type: "revenue_target", label: "Monthly Revenue Target (£5k)", defaultTarget: 5000 },
                                  { type: "zero_overdue", label: "Clear Overdue Invoices", defaultTarget: 0 },
                                  { type: "cash_buffer", label: "Cash Buffer Target (£10k)", defaultTarget: 10000 },
                                  { type: "rent_collected", label: "Rent collected on time", defaultTarget: 100 },
                                ].map((preset) => (
                                  <button
                                    key={preset.type}
                                    onClick={() => {
                                      const newGoal = {
                                        type: preset.type as GoalType,
                                        label: preset.label,
                                        target: preset.defaultTarget,
                                        setAt: new Date().toISOString(),
                                      };
                                      saveActiveGoals([newGoal]);
                                      setGoals([newGoal]);
                                      setActiveModal(null);
                                    }}
                                    className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:border-amber-500/50 transition-colors"
                                  >
                                    <div>
                                      <p className="text-sm font-semibold text-white">{preset.label}</p>
                                      <p className="text-xs text-[color:var(--muted-foreground)]">
                                        Click to activate this objective
                                      </p>
                                    </div>
                                    <ArrowRight className="size-4 text-amber-400" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })
                      }
                    >
                      Set Objective
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
          <div className="mt-8 border-t border-white/5 pt-8">
            <CliSeedSetup />
          </div>
        </>
      ) : null}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-xl max-h-[80vh] flex flex-col gap-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold font-[family-name:var(--font-display)] text-white">
                  {activeModal.title}
                </h3>
                {activeModal.description && (
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {activeModal.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-full p-1.5 text-[color:var(--muted-foreground)] hover:bg-white/10 hover:text-white transition-colors"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="size-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
              {activeModal.children}
            </div>
          </div>
        </div>
      )}

      {connected && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            onClick={openAccountant}
            className="flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 text-black shadow-lg shadow-amber-500/20 px-4 py-3 font-semibold transition-all duration-300"
          >
            <MessageSquare className="size-5" />
            <span>Ask Accountant</span>
          </Button>
        </div>
      )}

      {connected && accountantOpen && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[500px] w-96 flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400 font-semibold">Ledger Accountant</p>
              <h4 className="text-sm font-bold text-white">Ask about your numbers</h4>
            </div>
            <button
              onClick={() => setAccountantOpen(false)}
              className="rounded-full p-1 text-[color:var(--muted-foreground)] hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {accountantMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "ml-auto bg-amber-500 text-black font-medium"
                    : "mr-auto border border-white/10 bg-white/5 text-white"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {accountantLoading && (
              <div className="mr-auto border border-white/10 bg-white/5 text-white max-w-[85%] rounded-2xl px-3 py-2 text-sm flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin text-amber-400" />
                <span>Thinking...</span>
              </div>
            )}
          </div>

          {/* Quick Prompts */}
          {accountantMessages.length <= 1 && (
            <div className="px-4 py-2 border-t border-white/5 flex flex-wrap gap-1.5">
              {["What should I fix first?", "How is cash flow?", "Tax cleanups?"].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => void sendAccountantMessage(prompt)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white hover:border-amber-500/50 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendAccountantMessage();
            }}
            className="border-t border-white/10 p-3 flex gap-2"
          >
            <input
              type="text"
              placeholder="Ask a question..."
              value={accountantInput}
              onChange={(e) => setAccountantInput(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder-white/30 focus:border-amber-500/50 focus:outline-none"
            />
            <Button
              type="submit"
              size="sm"
              disabled={accountantLoading || !accountantInput.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-black rounded-xl text-xs font-semibold px-3 py-1"
            >
              Send
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function badgeForTone(tone: "positive" | "watch" | "urgent") {
  if (tone === "positive") {
    return "success" as const;
  }

  return tone === "urgent" ? "default" : "subtle";
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Building2;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <Icon className="mb-4 size-5 text-[color:var(--accent-foreground)]" />
      <p className="mb-2 text-sm font-semibold text-[color:var(--foreground)]">
        {title}
      </p>
      <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
        {body}
      </p>
    </div>
  );
}

function MetricRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Building2;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className="size-4 text-[color:var(--accent-foreground)]" />
        <p className="text-sm text-[color:var(--foreground-soft)]">{label}</p>
      </div>
      <p className="text-sm font-semibold text-[color:var(--foreground)]">
        {value}
      </p>
    </div>
  );
}

function InvoiceRow({
  invoice,
  currencyCode,
}: {
  invoice: Extract<
    SummaryResponse,
    { connected: true }
  >["invoices"]["overdue"][number];
  currencyCode: string | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[color:var(--foreground)]">
            {invoice.contactName}
          </p>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            {invoice.invoiceNumber} · {invoice.daysOverdue} days overdue
          </p>
        </div>
        <p className="text-sm font-semibold text-[color:var(--foreground)]">
          {formatCurrency(invoice.amountDue, currencyCode)}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)]">
      {copy}
    </div>
  );
}

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  return lines.map((line, idx) => {
    let cleanLine = line.trim();
    if (!cleanLine) {
      return <div key={idx} className="h-2" />;
    }

    // Headers
    if (cleanLine.startsWith("###")) {
      const content = cleanLine.replace(/^###\s*/, "");
      return (
        <h4
          key={idx}
          className="mt-4 mb-2 text-sm font-bold text-white uppercase tracking-wider"
        >
          {parseInlineMarkdown(content)}
        </h4>
      );
    }
    if (cleanLine.startsWith("##")) {
      const content = cleanLine.replace(/^##\s*/, "");
      return (
        <h3 key={idx} className="mt-4 mb-2 text-base font-bold text-white">
          {parseInlineMarkdown(content)}
        </h3>
      );
    }
    if (cleanLine.startsWith("#")) {
      const content = cleanLine.replace(/^#\s*/, "");
      return (
        <h2 key={idx} className="mt-5 mb-3 text-lg font-bold text-white">
          {parseInlineMarkdown(content)}
        </h2>
      );
    }

    // List items
    if (cleanLine.startsWith("-") || cleanLine.startsWith("*")) {
      const content = cleanLine.replace(/^[-*]\s*/, "");
      return (
        <ul key={idx} className="list-disc pl-5 my-1">
          <li className="text-sm leading-6 text-[color:var(--foreground-soft)]">
            {parseInlineMarkdown(content)}
          </li>
        </ul>
      );
    }

    // Normal paragraph
    return (
      <p
        key={idx}
        className="text-sm leading-6 text-[color:var(--foreground-soft)] mb-2"
      >
        {parseInlineMarkdown(cleanLine)}
      </p>
    );
  });
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
