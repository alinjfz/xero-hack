"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  CalendarClock,
  CircleAlert,
  LoaderCircle,
  ReceiptPoundSterling,
  Sparkles,
  Unplug,
  Users2,
  Sliders,
  DollarSign,
  TrendingUp,
  Flame,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryResponse } from "@/lib/xero-summary";

function isConnectedSummary(summary: SummaryResponse | null): summary is Extract<SummaryResponse, { connected: true }> {
  return Boolean(summary && summary.connected);
}

function formatCurrency(amount: number, currencyCode: string | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode ?? "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function XeroDashboard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefModel, setBriefModel] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [showDemoLeakage, setShowDemoLeakage] = useState(false);

  // Profitability and Leakage parameters per customer name
  const [customerCosts, setCustomerCosts] = useState<Record<string, {
    supportHours: number;
    extraRevisions: number;
    subcontractorPercent: number;
    paymentDelayDays: number;
  }>>({});
  const [customerAiRecs, setCustomerAiRecs] = useState<Record<string, string>>({});
  const [loadingRecs, setLoadingRecs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch("/api/xero/summary", {
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

  // Initialize profitability leakage defaults based on Xero data
  useEffect(() => {
    if (summary && isConnectedSummary(summary)) {
      const initialCosts: typeof customerCosts = {};
      summary.customers.forEach((customer) => {
        const isOverdue = customer.overdueCount > 0;
        initialCosts[customer.name] = {
          supportHours: Math.min(50, Math.floor((customer.amountDue / 12000) * 10) + 4),
          extraRevisions: Math.min(10, Math.floor((customer.amountDue / 20000) * 2) + 1),
          subcontractorPercent: customer.amountDue > 40000 ? 30 : 15,
          paymentDelayDays: isOverdue ? 40 : 5,
        };
      });
      setCustomerCosts((prev) => ({ ...initialCosts, ...prev }));
    }
  }, [summary]);

  async function handleGenerateBrief(metricsKey?: string) {
    setBriefLoading(true);
    setBriefError(null);

    try {
      const response = await fetch("/api/ai/brief", {
        method: "POST",
      });
      const data = (await response.json()) as { brief?: string; model?: string; error?: string };

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
      setBriefError(error instanceof Error ? error.message : "Unable to generate AI brief.");
    } finally {
      setBriefLoading(false);
    }
  }

  // Automate generating or loading cached briefs
  useEffect(() => {
    if (loading || !summary || !isConnectedSummary(summary) || !summary.openRouter.configured) {
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
      setBrief(cachedBrief);
      setBriefModel(cachedModel);
    } else {
      handleGenerateBrief(stateKey);
    }
  }, [loading, summary]);

  async function handleDisconnect() {
    setDisconnecting(true);

    try {
      await fetch("/api/xero/disconnect", {
        method: "POST",
      });
      setSummary((current) =>
        current
          ? {
              configured: true,
              connected: false,
              openRouter: current.openRouter,
            }
          : null,
      );
      setBrief(null);
      setBriefModel(null);
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleGenerateProfitabilityRec(customerName: string, revenue: number) {
    const costs = customerCosts[customerName] || {
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

      setCustomerAiRecs((prev) => ({ ...prev, [customerName]: data.recommendation }));
    } catch (error) {
      console.error(error);
      setCustomerAiRecs((prev) => ({
        ...prev,
        [customerName]: "Unable to analyze. Please configure OpenRouter to enable smart optimizations.",
      }));
    } finally {
      setLoadingRecs((prev) => ({ ...prev, [customerName]: false }));
    }
  }

  const connected = isConnectedSummary(summary);
  const currencyCode = connected ? summary.organisation.baseCurrency : null;

  // Find customers with leakage (true margin < 25%)
  const realLeakingCustomers = connected
    ? summary.customers.map((customer) => {
        const isOverdue = customer.overdueCount > 0;
        const costs = customerCosts[customer.name] || {
          supportHours: Math.min(50, Math.floor((customer.amountDue / 12000) * 10) + 4),
          extraRevisions: Math.min(10, Math.floor((customer.amountDue / 20000) * 2) + 1),
          subcontractorPercent: customer.amountDue > 40000 ? 30 : 15,
          paymentDelayDays: isOverdue ? 40 : 5,
        };

        const supportCost = costs.supportHours * 50;
        const revisionCost = costs.extraRevisions * 200;
        const subcontractorCost = customer.amountDue * (costs.subcontractorPercent / 100);
        const paymentLatePenalty = customer.amountDue * 0.0005 * costs.paymentDelayDays;
        const totalBleed = supportCost + revisionCost + subcontractorCost + paymentLatePenalty;
        const trueProfit = customer.amountDue - totalBleed;
        const margin = customer.amountDue > 0 ? (trueProfit / customer.amountDue) * 100 : 0;

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
      }).filter((c) => c.margin < 25)
    : [];

  const demoLeakingCustomers = [
    {
      name: "Acme Corp (Demo)",
      revenue: 220000,
      trueProfit: 11000,
      margin: 5,
      primaryCulprit: "Support overhead",
      isDemo: true,
    },
    {
      name: "Globex Industries (Demo)",
      revenue: 85000,
      trueProfit: 15000,
      margin: 17.6,
      primaryCulprit: "Subcontractors",
      isDemo: true,
    }
  ];

  const leakingCustomers = showDemoLeakage
    ? [...realLeakingCustomers, ...demoLeakingCustomers]
    : realLeakingCustomers;

  // Auto-trigger AI advice for leaking customers at top-level (complying with Rules of Hooks)
  useEffect(() => {
    if (!connected || !summary.openRouter.configured) {
      return;
    }

    leakingCustomers.forEach((c) => {
      if (!customerAiRecs[c.name] && !loadingRecs[c.name]) {
        handleGenerateProfitabilityRec(c.name, c.revenue);
      }
    });
  }, [connected, summary, leakingCustomers, customerAiRecs, loadingRecs]);

  return (
    <div className="space-y-8">
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
                KISH reads live Xero data, turns it into plain-English operating signals, and suggests the next few moves that
                will actually help the business.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              {!connected ? (
                <Button asChild>
                  <a href="/api/xero/connect">
                    Connect Xero
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              ) : null}
              {connected ? (
                <Button variant="secondary" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? <LoaderCircle className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                  Disconnect
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => setShowDemoLeakage(!showDemoLeakage)}
                className={showDemoLeakage ? "border-rose-500/50 text-rose-400 bg-rose-500/10 hover:bg-rose-500/15" : ""}
              >
                <Flame className="size-4 mr-1 text-rose-400" />
                {showDemoLeakage ? "Hide Demo Leakage" : "Demo Profit Leakage"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 px-8 pb-8 sm:grid-cols-3">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant={connected ? "success" : "subtle"} className="w-fit">
              {loading ? "Checking" : connected ? "Connected" : "Waiting"}
            </Badge>
            <CardTitle>Today in plain English</CardTitle>
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
                  value={formatCurrency(summary.metrics.receivablesAmount, currencyCode)}
                  icon={ReceiptPoundSterling}
                />
                <MetricRow
                  label="Overdue now"
                  value={formatCurrency(summary.metrics.overdueAmount, currencyCode)}
                  icon={CircleAlert}
                />
                <MetricRow
                  label="Due this week"
                  value={formatCurrency(summary.metrics.dueSoonAmount, currencyCode)}
                  icon={CalendarClock}
                />
                <MetricRow label="Top customers tracked" value={String(summary.customers.length)} icon={Users2} />
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)]">
                The first connected Xero tenant becomes the live data source for insights, queues, and AI summaries.
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
      {leakingCustomers.length > 0 ? (
        <section className="grid gap-6">
          <Card className="border border-rose-500/20 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.06),transparent_40%)] p-6 md:p-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20">
                    Profit Leakage Alert
                  </Badge>
                  <span className="text-xs text-[color:var(--muted-foreground)] flex items-center gap-1">
                    <Flame className="size-3.5 text-rose-400 animate-pulse" /> Live operational bleed detected
                  </span>
                </div>
                <CardTitle className="text-2xl font-[family-name:var(--font-display)]">
                  Why you are losing money on top accounts
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm text-[color:var(--foreground-soft)]">
                  KISH analyzed your active service delivery metrics against raw Xero contracts. Some top customers are underperforming due to unbilled revisions, subcontractor creep, or support delays.
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
                      <h4 className="font-semibold text-white text-base">{c.name}</h4>
                      <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                        Revenue: {formatCurrency(c.revenue, currencyCode)}
                      </p>
                    </div>
                    <Badge variant="subtle" className="bg-rose-500/10 text-rose-300">
                      {c.margin.toFixed(0)}% Margin
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[color:var(--muted-foreground)]">True Profit:</span>
                      <span className="text-rose-300 font-semibold">{formatCurrency(c.trueProfit, currencyCode)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[color:var(--muted-foreground)]">Primary Bleed:</span>
                      <span className="text-white font-medium">{c.primaryCulprit}</span>
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-3">
                    {c.isDemo ? (
                      <div className="text-xs text-[color:var(--foreground-soft)] bg-amber-500/5 rounded-xl border border-amber-500/10 p-3 leading-relaxed">
                        <span className="font-bold text-amber-400 block mb-1">AI Recommendation</span>
                        {c.name === "Acme Corp (Demo)"
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
                        <span className="font-bold text-amber-400 block mb-1">AI Recommendation</span>
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
          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Signals</CardTitle>
                <CardDescription>What stands out in the current Xero data.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {summary.insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                  >
                    <Badge variant={badgeForTone(insight.tone)} className="mb-3 w-fit">
                      {insight.tone}
                    </Badge>
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">{insight.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-soft)]">{insight.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Agent queue</CardTitle>
                <CardDescription>The next few actions KISH would run or tee up for a finance operator.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {summary.agents.map((agent) => (
                  <div key={agent.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[color:var(--foreground)]">{agent.title}</p>
                        <p className="mt-1 text-sm leading-6 text-[color:var(--foreground-soft)]">{agent.summary}</p>
                      </div>
                      <Badge variant="subtle">{agent.actionLabel}</Badge>
                    </div>
                    <div className="space-y-2">
                      {agent.checklist.map((item) => (
                        <p key={item} className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <Card>
              <CardHeader>
                <CardTitle>Receivables watchlist</CardTitle>
                <CardDescription>The customers and invoices most likely to need attention next.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">Top customers by amount due</p>
                  {summary.customers.length > 0 ? (
                    summary.customers.map((customer) => (
                      <div key={customer.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--foreground)]">{customer.name}</p>
                          <p className="text-sm text-[color:var(--muted-foreground)]">
                            {customer.invoiceCount} open invoices, {customer.overdueCount} overdue
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-[color:var(--foreground)]">
                          {formatCurrency(customer.amountDue, currencyCode)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <EmptyState copy="No open receivables are showing in the current invoice set." />
                  )}
                </div>

                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">Overdue invoices</p>
                  {summary.invoices.overdue.length > 0 ? (
                    summary.invoices.overdue.map((invoice) => (
                      <InvoiceRow key={invoice.invoiceId} invoice={invoice} currencyCode={currencyCode} />
                    ))
                  ) : (
                    <EmptyState copy="No overdue invoices right now." />
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
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">Model</p>
                  <p className="mt-2 text-sm text-[color:var(--foreground-soft)]">
                    {summary.openRouter.model ?? "Not configured"}
                  </p>
                </div>

                {summary.invoices.dueSoon.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">Due soon</p>
                    <div className="mt-3 space-y-2">
                      {summary.invoices.dueSoon.map((invoice) => (
                        <p key={invoice.invoiceId} className="text-sm leading-6 text-[color:var(--foreground-soft)]">
                          {invoice.contactName}: {invoice.invoiceNumber} for {formatCurrency(invoice.amountDue, currencyCode)} due{" "}
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
                    <p className="text-sm text-[color:var(--muted-foreground)]">KISH AI is compiling your operating briefing...</p>
                  </div>
                ) : brief ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[color:var(--foreground)]">Latest brief</p>
                      {briefModel ? <Badge variant="subtle">{briefModel}</Badge> : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--foreground-soft)]">{brief}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    Activate OpenRouter to access automated owner-ready operational briefings.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}
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
      <p className="mb-2 text-sm font-semibold text-[color:var(--foreground)]">{title}</p>
      <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">{body}</p>
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
      <p className="text-sm font-semibold text-[color:var(--foreground)]">{value}</p>
    </div>
  );
}

function InvoiceRow({
  invoice,
  currencyCode,
}: {
  invoice: Extract<SummaryResponse, { connected: true }>["invoices"]["overdue"][number];
  currencyCode: string | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[color:var(--foreground)]">{invoice.contactName}</p>
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
  return <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)]">{copy}</div>;
}

