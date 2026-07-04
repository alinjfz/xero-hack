"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/format-currency";
import type { InvoiceSnapshot } from "@/lib/xero-summary";
import type { WorldId } from "@/lib/world-tags";
import { Button } from "@/components/ui/button";

export type DetailPanel = {
  worldId: WorldId;
  hotspot: string;
  title: string;
  subtitle: string;
  invoices: InvoiceSnapshot[];
  currency: string | null;
};

type Props = {
  panel: DetailPanel | null;
  onClose: () => void;
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

export function WorldDetailSheet({ panel, onClose }: Props) {
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
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[78vh] w-full max-w-2xl overflow-hidden rounded-t-3xl border border-[color:var(--world-border)] bg-[color:var(--world-panel)] shadow-2xl"
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
              </div>
              <Button variant="secondary" size="sm" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="space-y-6 overflow-y-auto px-6 py-5">
              {panel.invoices.length === 0 ? (
                <p className="text-sm text-[color:var(--world-muted)]">Nothing to show here yet. Run the seed CLI to populate demo data.</p>
              ) : (
                groupInvoices(panel.invoices).map((group) => (
                  <section key={group.key} className="space-y-3">
                    <h3 className="text-sm font-semibold text-[color:var(--world-ink)]">{group.title}</h3>
                    <ul className="space-y-2">
                      {group.items.map((invoice) => (
                        <li
                          key={invoice.invoiceId}
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
