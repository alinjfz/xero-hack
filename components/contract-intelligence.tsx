"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, FileSearch, LoaderCircle, ShieldAlert, Sparkles, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildComplianceAlerts,
  formatMoney,
  type ComplianceAlert,
  type ContractKind,
  type StoredContract,
} from "@/lib/contract-intelligence";
import { type SummaryResponse } from "@/lib/xero-summary";

const STORAGE_KEY = "kish_contract_intelligence_records";

type ConnectedSummary = Extract<SummaryResponse, { connected: true }>;

const emptyDraft = {
  title: "",
  counterpartyName: "",
  kind: "customer" as ContractKind,
  sourceText: "",
};

export function ContractIntelligence({ summary }: { summary: ConnectedSummary }) {
  const [contracts, setContracts] = useState<StoredContract[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as StoredContract[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contracts));
  }, [contracts]);

  const alerts = useMemo(
    () =>
      buildComplianceAlerts({
        contracts,
        receivables: summary.invoices.awaitingPayment.map((invoice) => ({
          id: invoice.invoiceId,
          number: invoice.invoiceNumber,
          counterpartyName: invoice.contactName,
          total: invoice.total,
          amountOutstanding: invoice.amountDue,
          status: invoice.status,
          dueDate: invoice.dueDate,
          issueDate: invoice.issueDate,
          currency: invoice.currency ?? summary.organisation.baseCurrency,
        })),
        payables: summary.invoices.bills.map((invoice) => ({
          id: invoice.invoiceId,
          number: invoice.invoiceNumber,
          counterpartyName: invoice.contactName,
          total: invoice.total,
          amountOutstanding: invoice.amountDue,
          status: invoice.status,
          dueDate: invoice.dueDate,
          issueDate: invoice.issueDate,
          currency: invoice.currency ?? summary.organisation.baseCurrency,
        })),
      }),
    [contracts, summary],
  );

  async function handleExtractContract() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/contracts/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      const data = (await response.json()) as {
        error?: string;
        model?: string;
        terms?: StoredContract["terms"];
      };

      if (!response.ok || !data.terms) {
        throw new Error(data.error ?? "Unable to extract contract terms.");
      }

      const contract: StoredContract = {
        id: `${Date.now()}-${draft.counterpartyName}`,
        title: draft.title.trim() || `${draft.counterpartyName} contract`,
        counterpartyName: draft.counterpartyName.trim(),
        kind: draft.kind,
        sourceText: draft.sourceText.trim(),
        extractedAt: new Date().toISOString(),
        terms: data.terms,
      };

      setContracts((current) => [contract, ...current]);
      setLastModel(data.model ?? null);
      setDraft(emptyDraft);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to extract contract terms.");
    } finally {
      setLoading(false);
    }
  }

  function removeContract(contractId: string) {
    setContracts((current) => current.filter((contract) => contract.id !== contractId));
  }

  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;

  return (
    <section className="grid gap-6">
      <Card className="overflow-hidden border border-sky-400/20 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(248,184,78,0.08),transparent_32%)]">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="default" className="bg-sky-500/15 text-sky-200">
              Contract Intelligence
            </Badge>
            <Badge variant="subtle">
              {alerts.length} live checks
            </Badge>
            {criticalCount > 0 ? <Badge variant="default">{criticalCount} critical</Badge> : null}
          </div>
          <div className="space-y-2">
            <CardTitle className="font-[family-name:var(--font-display)] text-3xl">Contracts finally meet the ledger</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6 text-[color:var(--foreground-soft)]">
              Paste a supplier agreement, customer contract, or lease. KISH extracts commercial terms, then checks them against
              your live Xero invoices and bills to spot overcharges, missed uplifts, loose terms, and looming renewals.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 rounded-3xl border border-white/10 bg-black/10 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="text-[color:var(--muted-foreground)]">Contract title</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none ring-0"
                  placeholder="Acme annual support agreement"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-[color:var(--muted-foreground)]">Counterparty in Xero</span>
                <input
                  value={draft.counterpartyName}
                  onChange={(event) => setDraft((current) => ({ ...current, counterpartyName: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none ring-0"
                  placeholder="Name exactly or close to the Xero contact"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="text-[color:var(--muted-foreground)]">Contract type</span>
              <select
                value={draft.kind}
                onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as ContractKind }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="customer">Customer contract</option>
                <option value="supplier">Supplier agreement</option>
                <option value="lease">Lease</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-[color:var(--muted-foreground)]">Contract text</span>
              <textarea
                value={draft.sourceText}
                onChange={(event) => setDraft((current) => ({ ...current, sourceText: event.target.value }))}
                className="min-h-56 rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-white outline-none"
                placeholder="Paste the commercial section, payment schedule, renewal language, or the whole contract text."
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleExtractContract}
                disabled={loading || !draft.counterpartyName.trim() || !draft.sourceText.trim()}
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Extract and monitor
              </Button>
              <div className="text-xs leading-5 text-[color:var(--muted-foreground)]">
                Best demo flow: paste the pricing and renewal clauses from a real contract, then watch KISH compare them to Xero.
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50">{error}</div>
            ) : null}
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <SnapshotStat icon={FileSearch} label="Contracts loaded" value={String(contracts.length)} />
              <SnapshotStat icon={ShieldAlert} label="Compliance alerts" value={String(alerts.length)} />
              <SnapshotStat icon={UploadCloud} label="Bills tracked" value={String(summary.invoices.bills.length)} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">Live coverage</p>
              <div className="mt-3 grid gap-3 text-sm text-[color:var(--foreground-soft)]">
                <p>{summary.invoices.awaitingPayment.length} open customer invoices checked against uploaded agreements.</p>
                <p>{summary.invoices.bills.length} live supplier bills checked against commercial terms and leases.</p>
                <p>{summary.suppliers.length} top suppliers and {summary.customers.length} top customers visible in the current snapshot.</p>
                {lastModel ? <p>Extraction model: {lastModel}</p> : null}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">Demo prompts</p>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-[color:var(--foreground-soft)]">
                <p>Supplier overcharge: set a recurring amount lower than an open Xero bill.</p>
                <p>Renewal risk: include auto-renewal, a notice period, and a renewal date inside 30 days.</p>
                <p>Missed customer uplift: include a recurring amount plus a price increase date and percentage already in effect.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Compliance alerts</CardTitle>
            <CardDescription>Live mismatches between extracted contract terms and your current Xero ledger.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {alerts.length > 0 ? (
              alerts.slice(0, 8).map((alert) => <AlertRow key={alert.id} alert={alert} baseCurrency={summary.organisation.baseCurrency} />)
            ) : (
              <EmptyBlock copy="No issues yet. Add a contract and KISH will start checking live receivables and bills." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tracked contracts</CardTitle>
            <CardDescription>These extracted contract profiles stay in this browser for the demo session.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {contracts.length > 0 ? (
              contracts.map((contract) => (
                <div key={contract.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--foreground)]">{contract.title}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{contract.counterpartyName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="subtle">{contract.kind}</Badge>
                      <button
                        type="button"
                        onClick={() => removeContract(contract.id)}
                        className="text-xs text-[color:var(--muted-foreground)] transition hover:text-white"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm leading-6 text-[color:var(--foreground-soft)]">
                    <p>{contract.terms.summary}</p>
                    <p>
                      {contract.terms.recurringAmount
                        ? `${formatMoney(contract.terms.recurringAmount, contract.terms.currency ?? summary.organisation.baseCurrency)} ${contract.terms.billingFrequency}`
                        : "Recurring amount not found"}
                    </p>
                    <p>
                      Payment terms: {contract.terms.paymentTermDays ? `${contract.terms.paymentTermDays} days` : "not found"} · Auto-renewal:{" "}
                      {contract.terms.autoRenewal === null ? "unknown" : contract.terms.autoRenewal ? "yes" : "no"}
                    </p>
                    <p>
                      Renewal: {contract.terms.renewalDate ?? "not found"} · Notice:{" "}
                      {contract.terms.noticePeriodDays ? `${contract.terms.noticePeriodDays} days` : "not found"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyBlock copy="No contracts loaded yet. Paste one into the extractor to create a monitored contract profile." />
            )}
          </CardContent>
        </Card>
      </section>
    </section>
  );
}

function SnapshotStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <Icon className="mb-3 size-5 text-[color:var(--accent)]" />
      <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function AlertRow({ alert, baseCurrency }: { alert: ComplianceAlert; baseCurrency: string | null }) {
  const variant = alert.severity === "critical" ? "default" : alert.severity === "watch" ? "subtle" : "success";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={variant}>{alert.severity}</Badge>
            <Badge variant="subtle">{alert.contractKind}</Badge>
          </div>
          <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">{alert.title}</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-soft)]">{alert.body}</p>
        </div>
        {alert.amountDelta ? (
          <p className="text-sm font-semibold text-white">{formatMoney(alert.amountDelta, baseCurrency)}</p>
        ) : null}
      </div>
    </div>
  );
}

function EmptyBlock({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-5 text-sm leading-6 text-[color:var(--muted-foreground)]">{copy}</div>;
}
