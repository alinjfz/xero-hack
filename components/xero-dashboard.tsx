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

  async function handleGenerateBrief() {
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

      setBrief(data.brief ?? "");
      setBriefModel(data.model ?? null);
    } catch (error) {
      setBriefError(error instanceof Error ? error.message : "Unable to generate AI brief.");
    } finally {
      setBriefLoading(false);
    }
  }

  const connected = isConnectedSummary(summary);
  const currencyCode = connected ? summary.organisation.baseCurrency : null;

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
              {connected && summary.openRouter.configured ? (
                <Button variant="outline" onClick={handleGenerateBrief} disabled={briefLoading}>
                  {briefLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Generate AI brief
                </Button>
              ) : null}
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
              title="Optional AI layer"
              body="Plug in OpenRouter and get a compact owner-ready finance brief without moving data into the browser."
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
                    ? "Use OpenRouter to turn the live snapshot into a short owner-ready brief."
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

                {brief ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[color:var(--foreground)]">Latest brief</p>
                      {briefModel ? <Badge variant="subtle">{briefModel}</Badge> : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--foreground-soft)]">{brief}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    Generate a brief to get a plain-English summary of what matters this week.
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
