"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/format-currency";
import type { InvoiceSnapshot } from "@/lib/xero-summary";
import type { WorldId } from "@/lib/world-tags";
import { Button } from "@/components/ui/button";

export type DetailPanel = {
  target: string;
  worldId: WorldId;
  hotspot: string;
  title: string;
  subtitle: string;
  invoices: InvoiceSnapshot[];
  currency: string | null;
  invoiceActions?: "none" | "primary";
  actions?: DetailAction[];
  sections?: Array<{
    key: string;
    title: string;
    items: Array<{
      label: string;
      detail: string;
      value?: string;
      action?: DetailAction;
    }>;
  }>;
  chart?: {
    title: string;
    bars: Array<{
      label: string;
      income: number;
      expense: number;
    }>;
  };
};

export type DetailAction = {
  id: string;
  label: string;
  href?: string;
  meta?: Record<string, string>;
};

type Props = {
  panel: DetailPanel | null;
  onClose: () => void;
  getInvoicePrimaryLabel: (invoice: InvoiceSnapshot, panel: DetailPanel) => string | null;
  onInvoicePrimaryAction: (invoice: InvoiceSnapshot, panel: DetailPanel) => void;
  onDetailAction: (action: DetailAction, panel: DetailPanel) => void;
  actionLoadingInvoiceId?: string | null;
};

function plainLabel(invoice: InvoiceSnapshot, worldId: WorldId) {
  const name = invoice.contactName.replace(/\[(HOME|BIZ)\] /, "");

  if (worldId === "home" && invoice.reference?.includes("Rent")) {
    return invoice.isOverdue ? `${name} hasn't paid rent` : `Rent from ${name}`;
  }

  if (invoice.status === "DRAFT") {
    return `Draft for ${name}`;
  }

  if (invoice.isOverdue) {
    return `${name} is late on ${invoice.invoiceNumber}`;
  }

  return `${name} — ${invoice.reference ?? invoice.invoiceNumber}`;
}

function groupInvoices(invoices: InvoiceSnapshot[]) {
  const needsAttention = invoices.filter((invoice) => invoice.isOverdue || invoice.status === "DRAFT");
  const comingUp = invoices.filter(
    (invoice) => !invoice.isOverdue && invoice.status === "AUTHORISED" && invoice.amountDue > 0,
  );
  const allGood = invoices.filter((invoice) => invoice.status === "PAID" || invoice.amountDue === 0);

  return [
    { key: "needs", title: "Needs attention", items: needsAttention },
    { key: "soon", title: "Coming up", items: comingUp },
    { key: "good", title: "All good", items: allGood },
  ].filter((group) => group.items.length > 0);
}

export function WorldDetailSheet({
  panel,
  onClose,
  getInvoicePrimaryLabel,
  onInvoicePrimaryAction,
  onDetailAction,
  actionLoadingInvoiceId,
}: Props) {
  return (
    <AnimatePresence>
      {panel ? (
        <>
          <motion.button
            type="button"
            aria-label="Close details"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[color:var(--world-border)] bg-[color:var(--world-panel)] shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--world-border)] px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--world-muted)]">{panel.hotspot}</p>
                <h2 className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--world-ink)]">{panel.title}</h2>
                <p className="mt-1 text-sm text-[color:var(--world-muted)]">{panel.subtitle}</p>
                {panel.actions?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {panel.actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => onDetailAction(action, panel)}
                        className="rounded-[12px] border border-[color:var(--world-border)] bg-[color:var(--world-card-strong)] px-3 py-2 text-xs font-semibold text-[color:var(--world-ink)] transition hover:border-[color:var(--world-accent-soft)]"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button variant="secondary" size="sm" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {panel.chart ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-[color:var(--world-ink)]">{panel.chart.title}</h3>
                  <div className="rounded-2xl border border-[color:var(--world-border)] bg-[color:var(--world-card)] p-4">
                    <div className="flex h-40 items-end gap-3">
                      {panel.chart.bars.map((bar) => {
                        const maxValue = Math.max(
                          1,
                          ...panel.chart!.bars.flatMap((entry) => [entry.income, entry.expense]),
                        );
                        return (
                          <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                            <div className="flex w-full items-center justify-center gap-1 text-[10px] font-semibold text-[color:var(--world-ink)]">
                              <span>{formatCurrency(bar.income, panel.currency)}</span>
                              <span className="text-[color:var(--world-muted)]">/</span>
                              <span>{formatCurrency(bar.expense, panel.currency)}</span>
                            </div>
                            <div className="flex h-28 w-full items-end justify-center gap-1">
                              <div
                                className="w-4 rounded-t-md bg-[rgba(246,200,90,0.82)]"
                                style={{ height: `${(bar.income / maxValue) * 100}%` }}
                              />
                              <div
                                className="w-4 rounded-t-md bg-[rgba(111,150,204,0.72)]"
                                style={{ height: `${(bar.expense / maxValue) * 100}%` }}
                              />
                            </div>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--world-muted)]">{bar.label}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-[11px] uppercase tracking-[0.14em] text-[color:var(--world-muted)]">
                      <span className="inline-flex items-center gap-2">
                        <span className="block size-3 rounded-sm bg-[rgba(246,200,90,0.82)]" />
                        Income
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="block size-3 rounded-sm bg-[rgba(111,150,204,0.72)]" />
                        Costs
                      </span>
                    </div>
                  </div>
                </section>
              ) : null}
              {panel.sections?.length ? (
                panel.sections.map((section) => (
                  <section key={section.key} className="space-y-3">
                    <h3 className="text-sm font-semibold text-[color:var(--world-ink)]">{section.title}</h3>
                    <ul className="space-y-2">
                      {section.items.map((item) => (
                        <li
                          key={`${section.key}-${item.label}`}
                          className="rounded-2xl border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-[color:var(--world-ink)]">{item.label}</p>
                              <p className="mt-1 text-xs leading-6 text-[color:var(--world-muted)]">{item.detail}</p>
                              {item.action ? (
                                <button
                                  type="button"
                                  onClick={() => onDetailAction(item.action!, panel)}
                                  className="mt-3 rounded-[12px] border border-[color:var(--world-border)] bg-[color:var(--world-card-strong)] px-3 py-2 text-xs font-semibold text-[color:var(--world-ink)] transition hover:border-[color:var(--world-accent-soft)]"
                                >
                                  {item.action.label}
                                </button>
                              ) : null}
                            </div>
                            {item.value ? (
                              <p className="text-sm font-semibold text-[color:var(--world-accent)]">{item.value}</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              ) : null}
              {panel.invoices.length === 0 && !panel.sections?.length ? (
                <p className="text-sm text-[color:var(--world-muted)]">Nothing to show here yet. Load starter records or connect a tenant with active data.</p>
              ) : (
                groupInvoices(panel.invoices).map((group) => (
                  <section key={group.key} className="space-y-3">
                    <h3 className="text-sm font-semibold text-[color:var(--world-ink)]">{group.title}</h3>
                    <ul className="space-y-2">
                      {group.items.map((invoice) => (
                        <li
                          key={`${group.key}-${invoice.invoiceId}`}
                          className="rounded-2xl border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-[color:var(--world-ink)]">
                                {plainLabel(invoice, panel.worldId)}
                              </p>
                              <p className="mt-1 text-xs text-[color:var(--world-muted)]">
                                {invoice.invoiceNumber}
                                {invoice.dueDate ? ` · due ${invoice.dueDate}` : ""}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-[color:var(--world-accent)]">
                              {formatCurrency(invoice.amountDue || invoice.total, panel.currency)}
                            </p>
                          </div>
                          {panel.invoiceActions !== "none" && getInvoicePrimaryLabel(invoice, panel) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => onInvoicePrimaryAction(invoice, panel)}
                                disabled={actionLoadingInvoiceId === invoice.invoiceId}
                                className="rounded-[12px] border border-[color:var(--world-border)] bg-[color:var(--world-card-strong)] px-3 py-2 text-xs font-semibold text-[color:var(--world-ink)] transition hover:border-[color:var(--world-accent-soft)] disabled:opacity-55"
                              >
                                {actionLoadingInvoiceId === invoice.invoiceId ? "Working..." : getInvoicePrimaryLabel(invoice, panel)}
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
