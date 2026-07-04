"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Building2, Landmark, Link2, LoaderCircle, ReceiptPoundSterling, ShieldCheck, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Summary =
  | {
      configured: false;
      connected: false;
      error: string;
    }
  | {
      configured: true;
      connected: false;
      error?: string;
    }
  | {
      configured: true;
      connected: true;
      organisation: {
        id: string;
        name: string;
        legalName: string | null;
        countryCode: string | null;
        baseCurrency: string | null;
      };
      tenant: {
        id: string;
        name: string;
      };
      metrics: {
        accounts: number;
        bankAccounts: number;
        draftInvoices: number;
        awaitingPayment: number;
        overdue: number;
      };
    };

function isConnectedSummary(summary: Summary | null): summary is Extract<Summary, { connected: true }> {
  return Boolean(summary && summary.connected);
}

const capabilityCards = [
  {
    icon: Link2,
    title: "Live Xero connection",
    body: "OAuth is wired end to end, so KISH can authenticate against a real Xero tenant instead of a demo stub.",
  },
  {
    icon: Landmark,
    title: "Accounts and bank setup",
    body: "The starter fetches organisation details and chart-of-accounts data, which gives us a solid base for reporting and automations.",
  },
  {
    icon: ReceiptPoundSterling,
    title: "Invoice signal layer",
    body: "The summary route already surfaces draft, awaiting-payment, and overdue invoice counts for fast SME health checks.",
  },
];

export function XeroDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch("/api/xero/summary", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await response.json()) as Summary;
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
      setSummary({
        configured: true,
        connected: false,
      });
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = isConnectedSummary(summary);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader className="gap-4 p-8">
            <Badge variant="default" className="w-fit">
              KISH
            </Badge>
            <div className="space-y-3">
              <CardTitle className="max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-none sm:text-5xl">
                Knowledge & Intelligent SME Hub
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-[color:var(--foreground-soft)]">
                A Next.js 16 foundation for intelligent small-business tooling, starting with a real Xero connection and a clean
                control surface for finance-aware workflows.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant={'secondary'}>
                <a href="/api/xero/connect">
                  Connect Xero
                  <ArrowRight className="size-4" />
                </a>
              </Button>
              {connected ? (
                <Button variant="secondary" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? <LoaderCircle className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                  Disconnect
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 px-8 pb-8 sm:grid-cols-3">
            {capabilityCards.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <item.icon className="mb-4 size-5 text-[color:var(--accent-foreground)]" />
                <p className="mb-2 text-sm font-semibold text-[color:var(--foreground)]">{item.title}</p>
                <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">{item.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant={connected ? "success" : "subtle"} className="w-fit">
              {loading ? "Checking" : connected ? "Connected" : "Waiting"}
            </Badge>
            <CardTitle>Connection status</CardTitle>
            <CardDescription>
              {loading
                ? "Checking the current session and refreshing the token if needed."
                : summary?.configured
                  ? connected
                    ? "Xero is connected and the dashboard is reading live accounting data."
                    : "The app is configured. The next step is authorising a Xero tenant."
                  : "Environment variables are still missing, so OAuth cannot start yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">What KISH has right now</p>
              <p className="mt-3 text-sm leading-6 text-[color:var(--foreground-soft)]">
                OAuth login, token refresh, tenant selection, organisation lookup, accounts lookup, and invoice status summary.
              </p>
            </div>
            {summary && "error" in summary && summary.error ? (
              <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50">
                {summary.error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Live Xero snapshot</CardTitle>
            <CardDescription>What the connected tenant is exposing to KISH right now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex items-center gap-3 text-sm text-[color:var(--muted-foreground)]">
                <LoaderCircle className="size-4 animate-spin" />
                Pulling data from the Xero summary route.
              </div>
            ) : connected ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Metric label="Organisation" value={summary.organisation.name} icon={Building2} />
                  <Metric
                    label="Tenant"
                    value={summary.tenant.name}
                    detail={summary.organisation.baseCurrency ?? "No base currency"}
                    icon={ShieldCheck}
                  />
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Metric label="Accounts" value={String(summary.metrics.accounts)} icon={Landmark} />
                  <Metric label="Bank accounts" value={String(summary.metrics.bankAccounts)} icon={Landmark} />
                  <Metric label="Draft invoices" value={String(summary.metrics.draftInvoices)} icon={ReceiptPoundSterling} />
                  <Metric label="Awaiting payment" value={String(summary.metrics.awaitingPayment)} icon={ReceiptPoundSterling} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">Overdue invoices</p>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[color:var(--foreground)]">
                    {summary.metrics.overdue}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-6 text-sm leading-6 text-[color:var(--muted-foreground)]">
                Connect a Xero tenant and this panel will show organisation metadata plus an immediate invoice-health summary.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What you can build next</CardTitle>
            <CardDescription>The current integration unlocks a lot more than a simple login button.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {[
              "Show cash-flow and receivables dashboards for SME owners in plain language.",
              "Trigger agentic follow-ups for overdue invoices or unusual account activity.",
              "Sync CRM, ecommerce, or operations data into Xero-backed workflows.",
              "Create smart invoice, payment, reconciliation, or reporting copilots on top of verified accounting data.",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-6 text-[color:var(--foreground-soft)]">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">{label}</p>
        <Icon className="size-4 text-[color:var(--accent-foreground)]" />
      </div>
      <p className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--foreground)]">{value}</p>
      {detail ? <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{detail}</p> : null}
    </div>
  );
}
