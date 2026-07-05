import { getWorldForRecord, type WorldId } from "@/lib/world-tags";
import { getXeroSummary, type InvoiceSnapshot, type SummaryResponse } from "@/lib/xero-summary";

export type WorldHealth = "sunny" | "cloudy" | "stormy";

export type WorldAlert = {
  id: string;
  worldId: WorldId | "both";
  tone: "urgent" | "watch" | "positive";
  title: string;
  body: string;
  invoiceId?: string;
};

export type WorldActivity = {
  id: string;
  label: string;
  amount: number;
  when: string | null;
};

export type WorldMetrics = {
  receivables: number;
  overdue: number;
  dueSoon: number;
  billsDue: number;
  revenueThisMonth: number;
  draftCount: number;
};

export type WorldSnapshot = {
  id: WorldId;
  label: string;
  health: WorldHealth;
  metrics: WorldMetrics;
  alerts: WorldAlert[];
  recentActivity: WorldActivity[];
  receivables: InvoiceSnapshot[];
  payables: InvoiceSnapshot[];
  drafts: InvoiceSnapshot[];
  overdue: InvoiceSnapshot[];
  dueSoon: InvoiceSnapshot[];
};

export type WorldSummaryResponse =
  | Extract<SummaryResponse, { connected: false }>
  | (Extract<SummaryResponse, { connected: true }> & {
      worlds: WorldSnapshot[];
      combined: {
        overdueCount: number;
        bankBalance: number | null;
        currency: string | null;
      };
    });

function belongsToWorld(invoice: InvoiceSnapshot, worldId: WorldId) {
  return getWorldForRecord({
    contactName: invoice.contactName,
    reference: invoice.reference,
  }) === worldId;
}

function deriveHealth(metrics: WorldMetrics): WorldHealth {
  if (metrics.overdue > 0) {
    return "stormy";
  }

  if (metrics.dueSoon > 0 || metrics.billsDue > 0) {
    return "cloudy";
  }

  return "sunny";
}

function isCurrentMonth(dateString: string | null) {
  if (!dateString) {
    return false;
  }

  const date = new Date(dateString);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function buildAlerts(worldId: WorldId, invoices: InvoiceSnapshot[], payables: InvoiceSnapshot[]): WorldAlert[] {
  const alerts: WorldAlert[] = [];

  for (const invoice of invoices.filter((entry) => entry.isOverdue)) {
    alerts.push({
      id: `${worldId}-overdue-${invoice.invoiceId}`,
      worldId,
      tone: "urgent",
      title: worldId === "home" ? `${invoice.contactName.replace("[HOME] ", "")} hasn't paid rent` : `${invoice.contactName.replace("[BIZ] ", "")} is late`,
      body:
        worldId === "home"
          ? `${invoice.invoiceNumber} is ${invoice.daysOverdue} days overdue. Time for a polite nudge.`
          : `Invoice ${invoice.invoiceNumber} is ${invoice.daysOverdue} days overdue.`,
      invoiceId: invoice.invoiceId,
    });
  }

  for (const bill of payables.filter((entry) => entry.amountDue > 0 && !entry.isOverdue)) {
    alerts.push({
      id: `${worldId}-bill-${bill.invoiceId}`,
      worldId,
      tone: "watch",
      title: worldId === "home" ? "Property bill coming up" : "Supplier bill to review",
      body: `${bill.contactName.replace(/\[(HOME|BIZ)\] /, "")} — ${bill.invoiceNumber} due ${bill.dueDate ?? "soon"}.`,
      invoiceId: bill.invoiceId,
    });
  }

  if (worldId === "biz") {
    const printCo = payables.find((bill) => bill.contactName.includes("PrintCo") && bill.amountDue > 0);
    if (printCo) {
      alerts.push({
        id: "biz-printco-overcharge",
        worldId: "biz",
        tone: "urgent",
        title: "PrintCo may be overcharging",
        body: `${printCo.invoiceNumber} is ${printCo.total} — worth checking against your contract.`,
        invoiceId: printCo.invoiceId,
      });
    }
  }

  return alerts.slice(0, 4);
}

function buildWorld(
  worldId: WorldId,
  label: string,
  allReceivables: InvoiceSnapshot[],
  allPayables: InvoiceSnapshot[],
): WorldSnapshot {
  const receivables = allReceivables.filter((invoice) => belongsToWorld(invoice, worldId));
  const payables = allPayables.filter((invoice) => belongsToWorld(invoice, worldId));
  const awaiting = receivables.filter((invoice) => invoice.status === "AUTHORISED" && invoice.amountDue > 0);
  const overdueList = awaiting.filter((invoice) => invoice.isOverdue);
  const dueSoonList = awaiting.filter((invoice) => {
    if (!invoice.dueDate || invoice.isOverdue) {
      return false;
    }

    const dueDate = new Date(invoice.dueDate);
    const diffDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  });
  const drafts = receivables.filter((invoice) => invoice.status === "DRAFT");
  const openBills = payables.filter(
    (invoice) => (invoice.status === "AUTHORISED" || invoice.status === "DRAFT") && invoice.amountDue > 0,
  );
  const revenueThisMonth = receivables
    .filter((invoice) => invoice.status === "PAID" || (invoice.status === "AUTHORISED" && invoice.amountDue > 0))
    .filter((invoice) => isCurrentMonth(invoice.issueDate))
    .reduce((sum, invoice) => sum + invoice.total, 0);

  const metrics: WorldMetrics = {
    receivables: awaiting.reduce((sum, invoice) => sum + invoice.amountDue, 0),
    overdue: overdueList.reduce((sum, invoice) => sum + invoice.amountDue, 0),
    dueSoon: dueSoonList.reduce((sum, invoice) => sum + invoice.amountDue, 0),
    billsDue: openBills.reduce((sum, invoice) => sum + invoice.amountDue, 0),
    revenueThisMonth,
    draftCount: drafts.length,
  };

  const recentActivity = [...receivables, ...payables]
    .sort((left, right) => {
      const leftDate = left.issueDate ? new Date(left.issueDate).getTime() : 0;
      const rightDate = right.issueDate ? new Date(right.issueDate).getTime() : 0;
      return rightDate - leftDate;
    })
    .slice(0, 4)
    .map((invoice) => ({
      id: invoice.invoiceId,
      label: invoice.reference ?? invoice.invoiceNumber,
      amount: invoice.total,
      when: invoice.issueDate,
    }));

  return {
    id: worldId,
    label,
    health: deriveHealth(metrics),
    metrics,
    alerts: buildAlerts(worldId, awaiting, openBills),
    recentActivity,
    receivables: awaiting,
    payables: openBills,
    drafts,
    overdue: overdueList,
    dueSoon: dueSoonList,
  };
}

export async function getWorldSummary(cookieStore: Parameters<typeof getXeroSummary>[0]): Promise<WorldSummaryResponse> {
  const summary = await getXeroSummary(cookieStore);

  if (!summary.connected) {
    return summary;
  }

  const worlds = [
    buildWorld("home", "Rental house", summary.invoices.allReceivables, summary.invoices.allPayables),
    buildWorld("biz", "Small business", summary.invoices.allReceivables, summary.invoices.allPayables),
  ];

  const overdueCount = worlds.reduce((sum, world) => sum + world.overdue.length, 0);

  return {
    ...summary,
    worlds,
    combined: {
      overdueCount,
      bankBalance: summary.metrics.bankBalance,
      currency: summary.organisation.baseCurrency,
    },
  };
}
