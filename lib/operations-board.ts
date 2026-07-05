import { getWorldForRecord, type WorldId } from "@/lib/world-tags";
import type { InvoiceSnapshot, SummaryResponse } from "@/lib/xero-summary";

export type WorkflowTask = {
  id: string;
  invoiceId?: string;
  title: string;
  detail: string;
  location: "outside" | "home" | "biz";
  xp: number;
  reason: "overdue" | "draft" | "bill" | "goal" | "followup" | "tax";
};

export type InvoiceAssistantItem = {
  invoiceId: string;
  contactName: string;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string | null;
  reference: string | null;
  worldId: WorldId | "shared";
  gmailHref: string;
  hygieneNotes: string[];
};

export type OverdueChaseItem = {
  invoiceId: string;
  contactName: string;
  invoiceNumber: string;
  amountDue: number;
  daysOverdue: number;
  dueDate: string | null;
  worldId: WorldId | "shared";
  gmailHref: string;
  risk: "medium" | "high";
};

export type SupplierBillItem = {
  invoiceId: string;
  contactName: string;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string | null;
  worldId: WorldId | "shared";
  notes: string[];
};

export type TaxChecklistItem = {
  id: string;
  title: string;
  status: "ready" | "review" | "warning";
  detail: string;
  worldId: WorldId | "both";
  count: number;
};

export type FollowupTarget = {
  id: string;
  customerName: string;
  amountDue: number;
  invoiceCount: number;
  overdueCount: number;
  repeatCount: number;
  worldId: WorldId | "shared";
  reason: string;
  gmailHref: string;
  retainerCandidate: boolean;
};

export type BoardReport = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type OperationsBoard = {
  invoiceAssistant: InvoiceAssistantItem[];
  overdueChase: OverdueChaseItem[];
  supplierBills: SupplierBillItem[];
  tasks: WorkflowTask[];
  taxChecklist: TaxChecklistItem[];
  followupTargets: FollowupTarget[];
  reports: BoardReport[];
  sheetsRows: Array<Record<string, string | number>>;
};

function worldForInvoice(invoice: Pick<InvoiceSnapshot, "contactName" | "reference">): WorldId | "shared" {
  return getWorldForRecord({
    contactName: invoice.contactName,
    reference: invoice.reference,
  });
}

function encodeGmailDraft(params: { to?: string; subject: string; body: string }) {
  const url = new URL("https://mail.google.com/mail/");
  url.searchParams.set("view", "cm");
  url.searchParams.set("fs", "1");
  if (params.to) {
    url.searchParams.set("to", params.to);
  }
  url.searchParams.set("su", params.subject);
  url.searchParams.set("body", params.body);
  return url.toString();
}

function contactEmailFallback(name: string) {
  const slug = name
    .replace(/\[(HOME|BIZ)\]\s*/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".");

  return `${slug || "client"}@example.com`;
}

function buildDraftEmail(invoice: InvoiceSnapshot) {
  const cleanName = invoice.contactName.replace(/\[(HOME|BIZ)\]\s*/g, "");
  const subject = `Invoice draft ready: ${invoice.invoiceNumber}`;
  const body = [
    `Hi ${cleanName},`,
    "",
    `I've prepared invoice ${invoice.invoiceNumber}${invoice.reference ? ` for ${invoice.reference}` : ""}.`,
    "I'll send the final invoice from Xero once everything looks right on your side.",
    "",
    "Please reply if you want any line-item clarification before it goes out.",
    "",
    "Best,",
  ].join("\n");

  return encodeGmailDraft({
    to: contactEmailFallback(cleanName),
    subject,
    body,
  });
}

function buildOverdueEmail(invoice: InvoiceSnapshot) {
  const cleanName = invoice.contactName.replace(/\[(HOME|BIZ)\]\s*/g, "");
  const subject = `Follow-up on ${invoice.invoiceNumber}`;
  const body = [
    `Hi ${cleanName},`,
    "",
    `Following up on invoice ${invoice.invoiceNumber}${invoice.reference ? ` for ${invoice.reference}` : ""}.`,
    "Could you confirm the payment status and whether anything is holding this up on your side?",
    "",
    "If useful, I can resend the invoice or clarify any details.",
    "",
    "Best,",
  ].join("\n");

  return encodeGmailDraft({
    to: contactEmailFallback(cleanName),
    subject,
    body,
  });
}

function missingReferenceNotes(invoices: InvoiceSnapshot[]) {
  return invoices.filter((invoice) => !invoice.reference || invoice.reference.trim().length === 0);
}

function missingDueDateNotes(invoices: InvoiceSnapshot[]) {
  return invoices.filter((invoice) => invoice.status === "AUTHORISED" && invoice.amountDue > 0 && !invoice.dueDate);
}

function repeatCustomerMap(invoices: InvoiceSnapshot[]) {
  const grouped = new Map<
    string,
    { amountDue: number; invoiceCount: number; overdueCount: number; repeatCount: number; worldId: WorldId | "shared" }
  >();

  for (const invoice of invoices) {
    const existing = grouped.get(invoice.contactName) ?? {
      amountDue: 0,
      invoiceCount: 0,
      overdueCount: 0,
      repeatCount: 0,
      worldId: worldForInvoice(invoice),
    };

    if (invoice.amountDue > 0) {
      existing.amountDue += invoice.amountDue;
      existing.invoiceCount += 1;
    }
    if (invoice.isOverdue) {
      existing.overdueCount += 1;
    }
    existing.repeatCount += 1;
    grouped.set(invoice.contactName, existing);
  }

  return grouped;
}

function locationForWorld(worldId: WorldId | "shared"): WorkflowTask["location"] {
  if (worldId === "home") {
    return "home";
  }
  if (worldId === "biz") {
    return "biz";
  }
  return "outside";
}

export function buildOperationsBoard(summary: Extract<SummaryResponse, { connected: true }>): OperationsBoard {
  const draftInvoices = summary.invoices.drafts;
  const overdueInvoices = summary.invoices.overdue;
  const supplierBills = summary.invoices.bills;
  const allReceivables = summary.invoices.allReceivables;
  const allPayables = summary.invoices.allPayables;
  const missingReceivableRefs = missingReferenceNotes(allReceivables);
  const missingPayableRefs = missingReferenceNotes(allPayables);
  const dueDateRisks = missingDueDateNotes(allReceivables);
  const repeatCustomers = repeatCustomerMap(allReceivables);

  const invoiceAssistant = draftInvoices.slice(0, 6).map((invoice) => ({
    invoiceId: invoice.invoiceId,
    contactName: invoice.contactName,
    invoiceNumber: invoice.invoiceNumber,
    amountDue: invoice.amountDue || invoice.total,
    dueDate: invoice.dueDate,
    reference: invoice.reference,
    worldId: worldForInvoice(invoice),
    gmailHref: buildDraftEmail(invoice),
    hygieneNotes: [
      !invoice.reference ? "Missing reference" : "Reference present",
      !invoice.dueDate ? "Missing due date" : "Due date set",
    ],
  }));

  const overdueChase: OverdueChaseItem[] = overdueInvoices.slice(0, 8).map((invoice) => ({
    invoiceId: invoice.invoiceId,
    contactName: invoice.contactName,
    invoiceNumber: invoice.invoiceNumber,
    amountDue: invoice.amountDue,
    daysOverdue: invoice.daysOverdue,
    dueDate: invoice.dueDate,
    worldId: worldForInvoice(invoice),
    gmailHref: buildOverdueEmail(invoice),
    risk: invoice.daysOverdue >= 14 ? "high" : "medium",
  }));

  const supplierBillQueue = supplierBills.slice(0, 8).map((invoice) => {
    const notes: string[] = [];

    if (!invoice.reference) {
      notes.push("Reference missing");
    }
    if (!invoice.dueDate) {
      notes.push("No due date");
    }
    if (invoice.isOverdue) {
      notes.push("Already overdue");
    }

    return {
      invoiceId: invoice.invoiceId,
      contactName: invoice.contactName,
      invoiceNumber: invoice.invoiceNumber,
      amountDue: invoice.amountDue,
      dueDate: invoice.dueDate,
      worldId: worldForInvoice(invoice),
      notes: notes.length > 0 ? notes : ["Ready for review"],
    };
  });

  const tasks: WorkflowTask[] = [
    ...overdueChase.slice(0, 2).map((invoice) => ({
      id: `task-overdue-${invoice.invoiceId}`,
      invoiceId: invoice.invoiceId,
      title: `Chase ${invoice.contactName.replace(/\[(HOME|BIZ)\]\s*/g, "")}`,
      detail: `${invoice.invoiceNumber} is overdue and needs a follow-up drafted from Gmail.`,
      location: locationForWorld(invoice.worldId),
      xp: invoice.risk === "high" ? 110 : 85,
      reason: "overdue" as const,
    })),
    ...invoiceAssistant.slice(0, 2).map((invoice) => ({
      id: `task-draft-${invoice.invoiceId}`,
      invoiceId: invoice.invoiceId,
      title: `Send draft ${invoice.invoiceNumber}`,
      detail: "Check due date, reference, and send the client-facing note from the invoice assistant.",
      location: locationForWorld(invoice.worldId),
      xp: 70,
      reason: "draft" as const,
    })),
    ...supplierBillQueue.slice(0, 2).map((bill) => ({
      id: `task-bill-${bill.invoiceId}`,
      invoiceId: bill.invoiceId,
      title: `Review supplier bill ${bill.invoiceNumber}`,
      detail: bill.notes.join(" · "),
      location: locationForWorld(bill.worldId),
      xp: 55,
      reason: "bill" as const,
    })),
  ];

  if (missingReceivableRefs.length + missingPayableRefs.length > 0) {
    tasks.push({
      id: "task-tax-references",
      title: "Clean missing references before accountant handoff",
      detail: `${missingReceivableRefs.length + missingPayableRefs.length} records are missing a usable reference.`,
      location: "outside",
      xp: 65,
      reason: "tax",
    });
  }

  if (dueDateRisks.length > 0) {
    tasks.push({
      id: "task-due-date-risk",
      title: "Set due dates on authorised invoices",
      detail: `${dueDateRisks.length} live invoices are missing due dates and increase collection risk.`,
      location: "biz",
      xp: 60,
      reason: "tax",
    });
  }

  const followupTargets = [...repeatCustomers.entries()]
    .filter(([, value]) => value.invoiceCount > 0)
    .map(([customerName, value]) => {
      const reason =
        value.overdueCount > 0
          ? "Open receivables and overdue exposure make this a high-priority follow-up."
          : value.repeatCount >= 3
            ? "Repeat work pattern suggests a retainer or subscription conversation."
            : "Open invoices and repeat business history make this account worth a proactive check-in.";

      return {
        id: `followup-${customerName}`,
        customerName,
        amountDue: value.amountDue,
        invoiceCount: value.invoiceCount,
        overdueCount: value.overdueCount,
        repeatCount: value.repeatCount,
        worldId: value.worldId,
        reason,
        gmailHref: encodeGmailDraft({
          to: contactEmailFallback(customerName),
          subject: `Quick check-in from ${summary.organisation.name}`,
          body: [
            `Hi ${customerName.replace(/\[(HOME|BIZ)\]\s*/g, "")},`,
            "",
            "I wanted to check in on upcoming work and anything you need from us next.",
            "If it would help, we can also suggest a simpler recurring arrangement for repeat work.",
            "",
            "Best,",
          ].join("\n"),
        }),
        retainerCandidate: value.repeatCount >= 3,
      };
    })
    .sort((left, right) => {
      if (right.overdueCount !== left.overdueCount) {
        return right.overdueCount - left.overdueCount;
      }
      if (right.repeatCount !== left.repeatCount) {
        return right.repeatCount - left.repeatCount;
      }
      return right.amountDue - left.amountDue;
    })
    .slice(0, 6);

  const taxChecklist: TaxChecklistItem[] = [
    {
      id: "tax-drafts",
      title: "Draft invoice hygiene",
      status: draftInvoices.length > 0 ? "review" : "ready",
      detail:
        draftInvoices.length > 0
          ? `${draftInvoices.length} draft invoices still need review before they become part of the live trading picture.`
          : "No draft invoices are waiting on review.",
      worldId: "both",
      count: draftInvoices.length,
    },
    {
      id: "tax-missing-ref",
      title: "Missing-reference checks",
      status: missingReceivableRefs.length + missingPayableRefs.length > 0 ? "warning" : "ready",
      detail:
        missingReceivableRefs.length + missingPayableRefs.length > 0
          ? `${missingReceivableRefs.length} receivables and ${missingPayableRefs.length} payables need clearer references before handoff.`
          : "References look clean across receivables and payables.",
      worldId: "both",
      count: missingReceivableRefs.length + missingPayableRefs.length,
    },
    {
      id: "tax-due-risk",
      title: "Due-date risk checks",
      status: dueDateRisks.length > 0 ? "warning" : "ready",
      detail:
        dueDateRisks.length > 0
          ? `${dueDateRisks.length} authorised invoices are missing due dates, which weakens collections and review readiness.`
          : "All authorised invoices currently visible have due dates set.",
      worldId: "biz",
      count: dueDateRisks.length,
    },
    {
      id: "tax-bills",
      title: "Supplier bill review queue",
      status: supplierBills.length > 0 ? "review" : "ready",
      detail:
        supplierBills.length > 0
          ? `${supplierBills.length} open supplier bills should be checked for due dates, references, and timing impact.`
          : "No supplier bills are currently awaiting review.",
      worldId: "both",
      count: supplierBills.length,
    },
    {
      id: "tax-handoff",
      title: "Accountant handoff review",
      status:
        draftInvoices.length + missingReceivableRefs.length + missingPayableRefs.length + dueDateRisks.length > 0
          ? "review"
          : "ready",
      detail:
        draftInvoices.length + missingReceivableRefs.length + missingPayableRefs.length + dueDateRisks.length > 0
          ? "Resolve draft, reference, and due-date hygiene items before relying on this ledger for filing prep or external review."
          : "Ledger hygiene looks strong enough for an accountant handoff pack.",
      worldId: "both",
      count: draftInvoices.length + missingReceivableRefs.length + missingPayableRefs.length + dueDateRisks.length,
    },
  ];

  const reports: BoardReport[] = [
    {
      id: "report-drafts",
      label: "Draft pipeline",
      value: String(draftInvoices.length),
      detail: "Invoices that can be turned into live receivables next.",
    },
    {
      id: "report-overdue",
      label: "Overdue exposure",
      value: `${overdueInvoices.length}`,
      detail: "Customer invoices already past due.",
    },
    {
      id: "report-bills",
      label: "Bills to review",
      value: `${supplierBills.length}`,
      detail: "Supplier bills still awaiting payment or checking.",
    },
    {
      id: "report-repeat",
      label: "Retainer candidates",
      value: `${followupTargets.filter((target) => target.retainerCandidate).length}`,
      detail: "Accounts showing repeat-work patterns worth converting.",
    },
  ];

  const sheetsRows = [
    ...tasks.map((task) => ({
      type: "task",
      title: task.title,
      detail: task.detail,
      location: task.location,
      xp: task.xp,
      reason: task.reason,
    })),
    ...followupTargets.map((target) => ({
      type: "followup",
      title: target.customerName,
      detail: target.reason,
      location: target.worldId,
      xp: 0,
      reason: target.retainerCandidate ? "retainer_candidate" : "followup",
    })),
    ...taxChecklist.map((item) => ({
      type: "tax",
      title: item.title,
      detail: item.detail,
      location: item.worldId,
      xp: 0,
      reason: item.status,
    })),
  ];

  return {
    invoiceAssistant,
    overdueChase,
    supplierBills: supplierBillQueue,
    tasks: tasks.slice(0, 8),
    taxChecklist,
    followupTargets,
    reports,
    sheetsRows,
  };
}
