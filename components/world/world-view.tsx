"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  X,
} from "lucide-react";
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
  type GoalType,
  saveActiveGoal,
} from "@/lib/gamification";
import type { OperationsBoard } from "@/lib/operations-board";
import { pickMascotTip } from "@/lib/mascot-tips";
import type { WorldSummaryResponse } from "@/lib/world-summary";

type SceneId = "outside" | "home" | "biz";
type PanelTarget =
  | "mailbox"
  | "home-rent"
  | "home-bills"
  | "home-outlook"
  | "home-tax"
  | "biz-receivables"
  | "biz-drafts"
  | "biz-bills"
  | "biz-revenue"
  | "biz-tax"
  | "biz-followups";

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
  invoiceId?: string;
  title: string;
  detail: string;
  location: SceneId;
  xp: number;
  reason: "overdue" | "draft" | "bill" | "goal" | "followup" | "tax";
};

type GoalSuggestion = {
  type: GoalType;
  label: string;
  target: number;
  rationale: string;
};

type GoalTaskAction = {
  intent: "overdue_followup" | "retainer_pitch" | "check_in" | "invoice_send" | "rent_followup";
  customerName: string;
  recipientEmail?: string;
  subjectHint: string;
  context: string[];
};

type ActionableTask = WorldTask & {
  action?: GoalTaskAction;
};

type DraftModalState = {
  title: string;
  taskId: string;
  customerName: string;
  recipientEmail?: string;
  subject: string;
  body: string;
  gmailHref: string;
};

type HotspotStatus = {
  count: number;
  tone: "default" | "accent" | "danger";
  label: string;
  note: string;
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
    subtitle: "Rent, bills, property outlook, and landlord prep live here.",
    image: "/world/home-interior-scene.svg",
  },
  biz: {
    title: "Business interior",
    subtitle: "Invoices, drafts, supplier bills, tax readiness, and growth moves live here.",
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
      label: "Post box",
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
      label: "Rent vault",
      x: 43,
      y: 62,
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
    {
      id: "home-outlook",
      label: "Outlook desk",
      x: 16,
      y: 58,
      width: 18,
      height: 18,
      icon: Star,
      action: { type: "panel", target: "home-outlook" },
    },
    {
      id: "home-tax",
      label: "Landlord tax desk",
      x: 62,
      y: 27,
      width: 24,
      height: 18,
      icon: ScrollText,
      action: { type: "panel", target: "home-tax" },
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
    {
      id: "biz-tax",
      label: "Tax desk",
      x: 15,
      y: 20,
      width: 20,
      height: 14,
      icon: ScrollText,
      action: { type: "panel", target: "biz-tax" },
    },
    {
      id: "biz-followups",
      label: "Growth radar",
      x: 76,
      y: 19,
      width: 20,
      height: 14,
      icon: BriefcaseBusiness,
      action: { type: "panel", target: "biz-followups" },
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
  board: OperationsBoard | null,
): DetailPanel {
  const home = summary.worlds.find((world) => world.id === "home")!;
  const biz = summary.worlds.find((world) => world.id === "biz")!;
  const currency = summary.organisation.baseCurrency;
  const uniqueInvoices = (invoices: Array<(typeof home.receivables)[number]>) =>
    invoices.filter((invoice, index, all) => all.findIndex((entry) => entry.invoiceId === invoice.invoiceId) === index);
  const homeNetSpread = home.metrics.revenueThisMonth - home.metrics.billsDue;
  const sharedTaxItems = board?.taxChecklist.filter((item) => item.worldId === "both") ?? [];
  const bizTaxItems = board?.taxChecklist.filter((item) => item.worldId === "biz" || item.worldId === "both") ?? [];
  const followupTargets = board?.followupTargets.filter((item) => item.worldId === "biz" || item.worldId === "shared") ?? [];
  const growthReports = board?.reports ?? [];

  const panels: Record<PanelTarget, DetailPanel> = {
    mailbox: {
      target: "mailbox",
      worldId: "home",
      hotspot: "Mailbox",
      title: "Due soon and overdue",
      subtitle: "What needs a reminder before cash slips further",
      invoices: uniqueInvoices([...home.overdue, ...home.dueSoon, ...biz.overdue, ...biz.dueSoon]),
      currency,
    },
    "home-rent": {
      target: "home-rent",
      worldId: "home",
      hotspot: "Rent ledger",
      title: "Rent status",
      subtitle: "Open rent invoices and late rent",
      invoices: uniqueInvoices([...home.receivables, ...home.overdue]),
      currency,
    },
    "home-bills": {
      target: "home-bills",
      worldId: "home",
      hotspot: "Bills cabinet",
      title: "Property bills",
      subtitle: "Incoming costs for the property side",
      invoices: home.payables,
      currency,
    },
    "home-outlook": {
      target: "home-outlook",
      worldId: "home",
      hotspot: "Property outlook",
      title: "Property outlook",
      subtitle: "Visible rent, bill pressure, and source-backed next moves",
      invoices: [],
      currency,
      sections: [
        {
          key: "home-outlook-metrics",
          title: "Cash picture",
          items: [
            {
              label: "Visible rent this month",
              detail: "Based on property-side invoice activity currently visible in Xero.",
              value: formatCurrency(home.metrics.revenueThisMonth, currency),
            },
            {
              label: "Open rent waiting to collect",
              detail: "Authorised rent invoices still not converted into cash.",
              value: formatCurrency(home.metrics.receivables, currency),
            },
            {
              label: "Bills still due",
              detail: "Property-side payables still waiting to leave the bank.",
              value: formatCurrency(home.metrics.billsDue, currency),
            },
            {
              label: "Net monthly spread",
              detail: "Visible monthly rent less visible bills due. Useful as a quick operating view, not a full ROI.",
              value: formatCurrency(homeNetSpread, currency),
            },
          ],
        },
        {
          key: "home-outlook-guidance",
          title: "Suggestions",
          items: [
            {
              label: "Prioritise late rent first",
              detail:
                home.overdue.length > 0
                  ? `${home.overdue.length} property invoice${home.overdue.length === 1 ? "" : "s"} are already overdue and should be chased before reviewing lower-pressure items.`
                  : "No overdue property invoices are showing right now.",
            },
            {
              label: "True ROI needs one more input",
              detail:
                "Xero gives us rent and bill flows, but true ROI also needs property value and financing cost. Add those later to unlock a proper yield/ROI board.",
            },
          ],
        },
      ],
    },
    "home-tax": {
      target: "home-tax",
      worldId: "home",
      hotspot: "Landlord tax desk",
      title: "Landlord tax prep",
      subtitle: "What to review before self-assessment or accountant handoff",
      invoices: [],
      currency,
      sections: [
        {
          key: "home-tax-items",
          title: "Readiness checks",
          items: sharedTaxItems.map((item) => ({
            label: item.title,
            detail: item.detail,
            value: String(item.count),
          })),
        },
      ],
    },
    "biz-receivables": {
      target: "biz-receivables",
      worldId: "biz",
      hotspot: "Invoice counter",
      title: "Open receivables",
      subtitle: "Client invoices still awaiting payment",
      invoices: biz.receivables,
      currency,
    },
    "biz-drafts": {
      target: "biz-drafts",
      worldId: "biz",
      hotspot: "Draft board",
      title: "Draft invoices",
      subtitle: "Items ready to turn into live receivables",
      invoices: biz.drafts,
      currency,
    },
    "biz-bills": {
      target: "biz-bills",
      worldId: "biz",
      hotspot: "Supplier shelf",
      title: "Supplier bills",
      subtitle: "Bills the business still needs to handle",
      invoices: biz.payables,
      currency,
    },
    "biz-revenue": {
      target: "biz-revenue",
      worldId: "biz",
      hotspot: "Revenue board",
      title: "Revenue this month",
      subtitle: formatCurrency(biz.metrics.revenueThisMonth, currency),
      invoices: biz.receivables,
      currency,
    },
    "biz-tax": {
      target: "biz-tax",
      worldId: "biz",
      hotspot: "Tax desk",
      title: "Self-assessment readiness",
      subtitle: "Source-backed checks before tax prep or accountant handoff",
      invoices: [],
      currency,
      sections: [
        {
          key: "biz-tax-items",
          title: "Business readiness",
          items: bizTaxItems.map((item) => ({
            label: item.title,
            detail: item.detail,
            value: String(item.count),
          })),
        },
      ],
    },
    "biz-followups": {
      target: "biz-followups",
      worldId: "biz",
      hotspot: "Growth radar",
      title: "Growth radar",
      subtitle: "Who to follow up first and what the ledger suggests next",
      invoices: [],
      currency,
      sections: [
        {
          key: "biz-followup-targets",
          title: "Follow-up priority",
          items: followupTargets.slice(0, 4).map((target) => ({
            label: target.customerName,
            detail: target.reason,
            value: formatCurrency(target.amountDue, currency),
          })),
        },
        {
          key: "biz-followup-reports",
          title: "Growth signals",
          items: growthReports.slice(0, 3).map((report) => ({
            label: report.label,
            detail: report.detail,
            value: report.value,
          })),
        },
      ],
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

function contactEmailFallback(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".");

  return `${slug || "client"}@example.com`;
}

function buildGmailHref(params: { to?: string; subject: string; body: string }) {
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

function sceneIdForWorld(worldId: "home" | "biz" | "shared"): SceneId {
  if (worldId === "home") {
    return "home";
  }

  if (worldId === "biz") {
    return "biz";
  }

  return "outside";
}

function buildGoalTasks(params: {
  goalType: GoalType | null;
  board: OperationsBoard | null;
  currency: string | null;
}) {
  if (!params.goalType || !params.board) {
    return [] as ActionableTask[];
  }

  if (params.goalType === "rent_collected") {
    const rentDraft = params.board.invoiceAssistant.find((item) => item.worldId === "home");
    const rentFollowup = params.board.overdueChase.find((item) => item.worldId === "home");
    const rentActions: Array<ActionableTask | null> = [
      rentDraft
        ? {
            id: `goal-action-${rentDraft.invoiceId}`,
            invoiceId: rentDraft.invoiceId,
            title: "Send the next rent draft",
            detail: `${rentDraft.invoiceNumber} is ready to send for ${formatCurrency(rentDraft.amountDue, params.currency)}.`,
            location: "home",
            xp: 95,
            reason: "goal",
            action: {
              intent: "invoice_send",
              customerName: rentDraft.contactName,
              recipientEmail: contactEmailFallback(rentDraft.contactName),
              subjectHint: `Rent invoice ready: ${rentDraft.invoiceNumber}`,
              context: [
                `This is a rent invoice draft for ${rentDraft.contactName}.`,
                `Reference: ${rentDraft.reference ?? "rent invoice"}.`,
                `The owner wants to send it on time and sound professional, warm, and specific.`,
                "Tell them the invoice is being sent now and invite any clarifying questions.",
              ],
            },
          }
        : null,
      rentFollowup
        ? {
            id: `goal-action-${rentFollowup.invoiceId}`,
            invoiceId: rentFollowup.invoiceId,
            title: "Chase rent before it slips further",
            detail: `${rentFollowup.invoiceNumber} is overdue for ${formatCurrency(rentFollowup.amountDue, params.currency)} and needs a tailored follow-up.`,
            location: "home",
            xp: 110,
            reason: "goal",
            action: {
              intent: "rent_followup",
              customerName: rentFollowup.contactName,
              recipientEmail: contactEmailFallback(rentFollowup.contactName),
              subjectHint: `Follow-up on ${rentFollowup.invoiceNumber}`,
              context: [
                `This is a rent collection follow-up for ${rentFollowup.contactName}.`,
                `Invoice: ${rentFollowup.invoiceNumber}.`,
                `It is currently ${rentFollowup.daysOverdue} days overdue.`,
                "The owner wants a polite but clear rent reminder that asks for status and offers help if anything is blocking payment.",
              ],
            },
          }
        : null,
    ];

    return rentActions.filter((action): action is ActionableTask => Boolean(action));
  }

  if (params.goalType === "zero_overdue") {
    return params.board.overdueChase.slice(0, 2).map((item) => ({
      id: `goal-action-${item.invoiceId}`,
      invoiceId: item.invoiceId,
      title: `Clear ${item.invoiceNumber}`,
      detail: `${item.contactName} owes ${formatCurrency(item.amountDue, params.currency)} and is ${item.daysOverdue} days late.`,
      location: sceneIdForWorld(item.worldId),
      xp: item.risk === "high" ? 110 : 85,
      reason: "goal" as const,
      action: {
        intent: "overdue_followup",
        customerName: item.contactName,
        recipientEmail: contactEmailFallback(item.contactName),
        subjectHint: `Follow-up on ${item.invoiceNumber}`,
        context: [
          `This customer has an overdue invoice: ${item.invoiceNumber}.`,
          `It is ${item.daysOverdue} days overdue.`,
          "Write a polite but commercially sharp follow-up that asks for an update and offers to resend anything needed.",
        ],
      },
    }));
  }

  if (params.goalType === "revenue_target") {
    return params.board.invoiceAssistant.slice(0, 2).map((item) => ({
      id: `goal-action-${item.invoiceId}`,
      invoiceId: item.invoiceId,
      title: `Turn ${item.invoiceNumber} into live revenue`,
      detail: `Draft value ${formatCurrency(item.amountDue, params.currency)}. Check hygiene and send.`,
      location: sceneIdForWorld(item.worldId),
      xp: 75,
      reason: "goal" as const,
      action: {
        intent: "invoice_send",
        customerName: item.contactName,
        recipientEmail: contactEmailFallback(item.contactName),
        subjectHint: `Invoice ready: ${item.invoiceNumber}`,
        context: [
          `This is an invoice draft for ${item.contactName}.`,
          `Reference: ${item.reference ?? item.invoiceNumber}.`,
          "Write a short, confident client email saying the invoice is being sent now and inviting any practical questions.",
        ],
      },
    }));
  }

  if (params.goalType === "cash_buffer") {
    return params.board.supplierBills.slice(0, 2).map((item) => ({
      id: `goal-action-${item.invoiceId}`,
      invoiceId: item.invoiceId,
      title: `Review ${item.invoiceNumber} before cash leaves`,
      detail: `${item.contactName} bill for ${formatCurrency(item.amountDue, params.currency)}.`,
      location: sceneIdForWorld(item.worldId),
      xp: 55,
      reason: "goal" as const,
    }));
  }

  return params.board.tasks.slice(0, 2).map((item) => ({
    ...item,
    title: item.title,
    detail: item.detail,
  }));
}

function buildHotspotStatuses(summary: Extract<WorldSummaryResponse, { connected: true }>, tasks: WorldTask[]) {
  const home = summary.worlds.find((world) => world.id === "home")!;
  const biz = summary.worlds.find((world) => world.id === "biz")!;
  const openTasks = tasks.length;
  const overdueEverywhere = home.overdue.length + biz.overdue.length;

  const countTone = (count: number, severeAt = 3): HotspotStatus["tone"] => {
    if (count >= severeAt) {
      return "danger";
    }

    if (count > 0) {
      return "accent";
    }

    return "default";
  };
  const taxTaskCount = tasks.filter((task) => task.reason === "tax").length;
  const growthTaskCount = tasks.filter(
    (task) => task.reason === "followup" || task.reason === "goal" || task.reason === "overdue",
  ).length;

  return {
    "outside-house": {
      count: home.overdue.length + home.payables.length,
      tone: countTone(home.overdue.length + home.payables.length),
      label: "House pulse",
      note: "Rent and property costs are moving inside the house.",
    },
    "outside-mailbox": {
      count: home.dueSoon.length + home.overdue.length + biz.dueSoon.length + biz.overdue.length,
      tone: countTone(home.dueSoon.length + home.overdue.length + biz.dueSoon.length + biz.overdue.length),
      label: "Fresh post",
      note: "This is the fastest way to spot new due-soon or overdue items.",
    },
    "outside-business": {
      count: biz.receivables.length + biz.drafts.length + biz.payables.length,
      tone: countTone(biz.receivables.length + biz.drafts.length + biz.payables.length, 4),
      label: "Open shop",
      note: "The business side is carrying your client work, revenue, and bills.",
    },
    "home-rent": {
      count: home.receivables.length + home.overdue.length,
      tone: countTone(home.receivables.length + home.overdue.length),
      label: "Rent desk",
      note: "Track tenants, unpaid rent, and upcoming cash into the property side.",
    },
    "home-bills": {
      count: home.payables.length,
      tone: countTone(home.payables.length),
      label: "Bills pile",
      note: "Utilities, repairs, and supplier costs are stored here.",
    },
    "home-outlook": {
      count: home.receivables.length + home.payables.length,
      tone: countTone(home.overdue.length + home.payables.length),
      label: "Property view",
      note: "Rent inflow, bill pressure, and landlord planning live here.",
    },
    "home-tax": {
      count: taxTaskCount,
      tone: countTone(taxTaskCount),
      label: "Landlord prep",
      note: "Use this desk to sanity-check property-side filing readiness.",
    },
    "biz-receivables": {
      count: biz.receivables.length + biz.overdue.length,
      tone: countTone(biz.receivables.length + biz.overdue.length, 4),
      label: "Client cash",
      note: "Open invoices are waiting to turn into real money.",
    },
    "biz-drafts": {
      count: biz.drafts.length,
      tone: countTone(biz.drafts.length),
      label: "Ready drafts",
      note: "Draft work is queued here, ready to go live.",
    },
    "biz-bills": {
      count: biz.payables.length,
      tone: countTone(biz.payables.length),
      label: "Supplier stack",
      note: "Costs leaving the business are accumulating on this shelf.",
    },
    "biz-revenue": {
      count: Math.max(1, Math.ceil(biz.metrics.revenueThisMonth > 0 ? biz.metrics.revenueThisMonth / 10000 : 0)),
      tone: biz.metrics.revenueThisMonth > 0 ? "accent" : "default",
      label: "Revenue signal",
      note: "This board should feel alive whenever the month is producing revenue.",
    },
    "biz-tax": {
      count: taxTaskCount,
      tone: countTone(taxTaskCount),
      label: "Tax pressure",
      note: "This desk holds readiness checks before you rely on the ledger for filing.",
    },
    "biz-followups": {
      count: growthTaskCount,
      tone: countTone(growthTaskCount),
      label: "Growth moves",
      note: "Accounts worth follow-up or conversion should light up here.",
    },
    overview: {
      count: overdueEverywhere + openTasks,
      tone: countTone(overdueEverywhere + openTasks, 5),
      label: "World state",
      note: "Use this as the global pressure gauge for the whole world.",
    },
  } satisfies Record<string, HotspotStatus>;
}

function getTaskActionLabel(task: ActionableTask) {
  if (task.action) {
    return "Draft with AI";
  }

  if (task.reason === "bill") {
    return "Open review";
  }

  if (task.reason === "tax") {
    return "Open checklist";
  }

  if (task.reason === "followup") {
    return "Open follow-up";
  }

  if (task.reason === "draft") {
    return "Open draft";
  }

  if (task.reason === "overdue" || task.reason === "goal") {
    return "Open task";
  }

  return "Open";
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
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalSuggestions, setGoalSuggestions] = useState<GoalSuggestion[]>([]);
  const [goalSuggestionsLoading, setGoalSuggestionsLoading] = useState(false);
  const [selectedGoalType, setSelectedGoalType] = useState<GoalType>(goal?.type ?? "revenue_target");
  const [selectedGoalTarget, setSelectedGoalTarget] = useState<number>(goal?.target ?? 5000);
  const [selectedGoalLabel, setSelectedGoalLabel] = useState<string>(goal?.label ?? "");
  const [customGoalText, setCustomGoalText] = useState("");
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [earnedXp, setEarnedXp] = useState(0);
  const [draftModal, setDraftModal] = useState<DraftModalState | null>(null);
  const [draftLoadingId, setDraftLoadingId] = useState<string | null>(null);
  const [invoiceActionLoadingId, setInvoiceActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [summaryResponse, tasksResponse, boardResponse] = await Promise.all([
          fetch("/api/world/summary", { credentials: "include", cache: "no-store" }),
          fetch("/api/world/tasks", { credentials: "include", cache: "no-store" }),
          fetch("/api/operations/board", { credentials: "include", cache: "no-store" }),
        ]);
        const summaryData = (await summaryResponse.json()) as WorldSummaryResponse;
        const tasksData = (await tasksResponse.json().catch(() => ({ tasks: [] }))) as { tasks?: WorldTask[] };
        const boardData = (await boardResponse.json().catch(() => null)) as OperationsBoard | null;

        if (!cancelled) {
          setSummary(summaryData);
          setTasks(tasksData.tasks ?? []);
          setBoard(boardData);
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
  const progress = computeGoalProgress(goal, summary);
  const goalTasks = buildGoalTasks({
    goalType: goal?.type ?? null,
    board,
    currency: summary.organisation.baseCurrency,
  });
  const dedupedBoardTasks = tasks.filter(
    (task) => !task.invoiceId || !goalTasks.some((goalTask) => goalTask.invoiceId && goalTask.invoiceId === task.invoiceId),
  );
  const allTasks: ActionableTask[] = [...goalTasks, ...dedupedBoardTasks];
  const sceneTasks = allTasks.filter((task) => task.location === scene || task.location === "outside");
  const sceneMeta = SCENE_META[scene];
  const totalReceivables = home.metrics.receivables + biz.metrics.receivables;
  const hotspotStatuses = buildHotspotStatuses(summary, allTasks);
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

  function handleUndoTask(task: WorldTask) {
    if (!completedTaskIds.includes(task.id)) {
      return;
    }

    setCompletedTaskIds((current) => current.filter((id) => id !== task.id));
    setEarnedXp((current) => Math.max(0, current - task.xp));
  }

  async function openGoalModal() {
    if (goal) {
      setSelectedGoalType(goal.type);
      setSelectedGoalTarget(goal.target);
      setSelectedGoalLabel(goal.label);
      setCustomGoalText(goal.customText ?? "");
    }

    setGoalModalOpen(true);
    setGoalSuggestionsLoading(true);

    try {
      const response = await fetch("/api/ai/goal-suggestions", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json()) as { suggestions?: GoalSuggestion[] };
      setGoalSuggestions(data.suggestions ?? []);
      if (data.suggestions?.[0]) {
        setSelectedGoalType(data.suggestions[0].type);
        setSelectedGoalTarget(data.suggestions[0].target);
        setSelectedGoalLabel(data.suggestions[0].label);
      }
    } finally {
      setGoalSuggestionsLoading(false);
    }
  }

  function applyGoal() {
    const label = selectedGoalType === "custom" ? customGoalText || "Custom goal" : selectedGoalLabel;
    const nextGoal: ActiveGoal = {
      type: selectedGoalType,
      label,
      target: selectedGoalTarget,
      customText: selectedGoalType === "custom" ? customGoalText : undefined,
      setAt: new Date().toISOString(),
    };
    saveActiveGoal(nextGoal);
    setGoal(nextGoal);
    const baseline = computeGoalProgress(nextGoal, connectedSummary);
    if (baseline.percent > 0) {
      const next = recordStreakAction("progress");
      setStreak(next);
    } else {
      saveStreakState(streak);
    }
    setGoalModalOpen(false);
  }

  async function handleGenerateDraft(task: ActionableTask) {
    if (!task.action) {
      return;
    }

    setDraftLoadingId(task.id);

    try {
      const response = await fetch("/api/ai/outreach-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...task.action,
          senderName: connectedSummary.tenant.name,
          senderCompany: connectedSummary.organisation.legalName ?? connectedSummary.organisation.name,
        }),
      });
      const data = (await response.json()) as {
        draft?: string;
        subject?: string;
        body?: string;
        gmailHref?: string;
      };

      if (!response.ok || !data.body || !data.subject) {
        throw new Error("Unable to generate AI draft.");
      }

      setDraftModal({
        title: task.title,
        taskId: task.id,
        customerName: task.action.customerName,
        recipientEmail: task.action.recipientEmail,
        subject: data.subject,
        body: data.body,
        gmailHref: data.gmailHref ?? buildGmailHref({ to: task.action.recipientEmail, subject: data.subject, body: data.body }),
      });
    } finally {
      setDraftLoadingId(null);
    }
  }

  function buildInvoiceTask(invoice: DetailPanel["invoices"][number], sourcePanel: DetailPanel): ActionableTask {
    const existingTask = allTasks.find((task) => task.invoiceId === invoice.invoiceId);

    if (existingTask) {
      return existingTask;
    }

    const cleanName = invoice.contactName.replace(/\[(HOME|BIZ)\]\s*/g, "");
    const invoiceLocation = sceneIdForWorld(sourcePanel.worldId);

    if (invoice.status === "DRAFT") {
      return {
        id: `sheet-draft-${invoice.invoiceId}`,
        invoiceId: invoice.invoiceId,
        title: `Send draft ${invoice.invoiceNumber}`,
        detail: "Review the invoice, then send a tailored client note from the invoice assistant.",
        location: invoiceLocation,
        xp: 70,
        reason: "draft",
        action: {
          intent: "invoice_send",
          customerName: cleanName,
          recipientEmail: contactEmailFallback(cleanName),
          subjectHint: `Invoice ready: ${invoice.invoiceNumber}`,
          context: [
            `This is an invoice draft for ${cleanName}.`,
            `Invoice number: ${invoice.invoiceNumber}.`,
            `Reference: ${invoice.reference ?? invoice.invoiceNumber}.`,
            "Write a polished message that says the invoice is being sent now and invites any practical questions.",
          ],
        },
      };
    }

    if (invoice.isOverdue || sourcePanel.target === "mailbox" || sourcePanel.target === "biz-revenue") {
      return {
        id: `sheet-overdue-${invoice.invoiceId}`,
        invoiceId: invoice.invoiceId,
        title: `Chase ${cleanName}`,
        detail: `${invoice.invoiceNumber} needs a tailored follow-up before it slips further.`,
        location: invoiceLocation,
        xp: invoice.isOverdue ? 85 : 60,
        reason: "overdue",
        action: {
          intent: sourcePanel.worldId === "home" ? "rent_followup" : "overdue_followup",
          customerName: cleanName,
          recipientEmail: contactEmailFallback(cleanName),
          subjectHint: `Follow-up on ${invoice.invoiceNumber}`,
          context: [
            `This customer needs a follow-up on invoice ${invoice.invoiceNumber}.`,
            invoice.reference ? `Reference: ${invoice.reference}.` : "Use the invoice context to sound specific.",
            invoice.dueDate ? `Due date from source: ${invoice.dueDate}.` : "No due date is visible in source data.",
            "Keep the email practical, specific to the scenario, and ask for an update without inventing any figures.",
          ],
        },
      };
    }

    if (sourcePanel.target === "home-bills" || sourcePanel.target === "biz-bills") {
      return {
        id: `sheet-bill-${invoice.invoiceId}`,
        invoiceId: invoice.invoiceId,
        title: `Review supplier bill ${invoice.invoiceNumber}`,
        detail: "Check due date, reference quality, and timing impact before accountant handoff.",
        location: invoiceLocation,
        xp: 55,
        reason: "bill",
      };
    }

    return {
      id: `sheet-task-${invoice.invoiceId}`,
      invoiceId: invoice.invoiceId,
      title: `Review ${invoice.invoiceNumber}`,
      detail: "Open the related work area and check the next step.",
      location: invoiceLocation,
      xp: 45,
      reason: "followup",
    };
  }

  function getInvoicePrimaryLabel(invoice: DetailPanel["invoices"][number], sourcePanel: DetailPanel) {
    if (invoice.status === "DRAFT" && sourcePanel.target === "biz-drafts") {
      return "Authorise in Xero";
    }

    return getTaskActionLabel(buildInvoiceTask(invoice, sourcePanel));
  }

  async function handleInvoicePrimaryAction(invoice: DetailPanel["invoices"][number], sourcePanel: DetailPanel) {
    if (invoice.status === "DRAFT" && sourcePanel.target === "biz-drafts") {
      setInvoiceActionLoadingId(invoice.invoiceId);

      try {
        const response = await fetch(`/api/xero/invoices/${invoice.invoiceId}/authorise`, {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Unable to authorise invoice in Xero.");
        }

        window.location.reload();
      } finally {
        setInvoiceActionLoadingId(null);
      }

      return;
    }

    handleTaskAction(buildInvoiceTask(invoice, sourcePanel));
  }

  function handleOpenTaskFromPanel(invoice: DetailPanel["invoices"][number], sourcePanel: DetailPanel) {
    setPanel(null);
    openTaskArea(buildInvoiceTask(invoice, sourcePanel));
  }

  function openTaskArea(task: ActionableTask) {
    const target: PanelTarget =
      task.location === "home"
        ? task.reason === "bill"
          ? "home-bills"
          : "home-rent"
        : task.location === "biz"
          ? task.reason === "bill"
            ? "biz-bills"
            : task.reason === "draft"
              ? "biz-drafts"
              : task.reason === "followup"
                ? "biz-revenue"
                : "biz-receivables"
          : task.reason === "tax"
            ? "mailbox"
            : "biz-receivables";

    if (task.location !== "outside") {
      setScene(task.location);
    }
    setPanel(buildPanel(connectedSummary, target, board));
  }

  function handleTaskAction(task: ActionableTask) {
    if (task.action) {
      void handleGenerateDraft(task);
      return;
    }

    openTaskArea(task);
  }

  function handleHotspot(hotspot: SceneHotspot) {
    if (hotspot.action.type === "scene") {
      setScene(hotspot.action.scene);
      setPanel(null);
      return;
    }

    setPanel(buildPanel(connectedSummary, hotspot.action.target, board));
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
                <Button
                  type="button"
                  onClick={openGoalModal}
                  className="w-full rounded-[16px] bg-[color:var(--world-accent)] text-[#1d140d] hover:bg-[color:var(--world-accent-2)]"
                >
                  Set New Goal
                </Button>
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

            <PanelShell eyebrow="Tax" title="Self-assessment readiness">
              <div className="space-y-3">
                {(board?.taxChecklist ?? []).slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[18px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[color:var(--world-ink)]">{item.title}</p>
                        <p className="mt-1 text-xs leading-6 text-[color:var(--world-muted)]">{item.detail}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          item.status === "ready"
                            ? "bg-[rgba(107,196,127,0.14)] text-[color:var(--world-ink)]"
                            : item.status === "warning"
                              ? "bg-[rgba(245,110,76,0.14)] text-[color:var(--world-ink)]"
                              : "bg-[rgba(246,200,90,0.16)] text-[color:var(--world-ink)]"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
                {!board?.taxChecklist?.length ? (
                  <div className="rounded-[18px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3 text-sm text-[color:var(--world-muted)]">
                    Connect more Xero data to unlock filing prep checks, reference hygiene, and accountant handoff tasks.
                  </div>
                ) : null}
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
                    className="world-scene-image object-cover object-center"
                  />
                  <div className="world-scene-depth pointer-events-none absolute inset-0" />
                  {scene === "outside" ? (
                    <>
                      <div className="world-sky-band pointer-events-none absolute inset-x-0 top-0 h-[34%]" />
                      <div className="world-sun pointer-events-none absolute right-[7%] top-[7%] size-24 rounded-full" />
                      <div className="world-cloud world-cloud-one pointer-events-none absolute left-[10%] top-[10%] h-8 w-16 rounded-full bg-white/65" />
                      <div className="world-cloud world-cloud-two pointer-events-none absolute right-[16%] top-[14%] h-10 w-20 rounded-full bg-white/50" />
                      <div className="world-cloud world-cloud-three pointer-events-none absolute left-[44%] top-[8%] h-9 w-18 rounded-full bg-white/55" />
                      <div className="world-bird pointer-events-none absolute left-[28%] top-[18%]" />
                      <div className="world-bird world-bird-delayed pointer-events-none absolute left-[34%] top-[16%]" />
                      <div className="world-bird world-bird-far pointer-events-none absolute left-[60%] top-[20%]" />
                      <div className="world-voxel-shadow pointer-events-none absolute bottom-[16%] left-[11%] h-8 w-[24%]" />
                      <div className="world-voxel-shadow pointer-events-none absolute bottom-[18%] left-[49%] h-10 w-[31%]" />
                      <div className="world-flower-bed pointer-events-none absolute bottom-[11%] left-[19%] h-12 w-24" />
                      <div className="world-flower-bed world-flower-bed-right pointer-events-none absolute bottom-[13%] right-[28%] h-12 w-24" />
                      <div className="world-window-spark pointer-events-none absolute left-[19%] top-[58%] h-6 w-6" />
                      <div className="world-window-spark world-window-spark-delayed pointer-events-none absolute left-[64%] top-[55%] h-6 w-6" />
                    </>
                  ) : null}
                  {scene === "home" ? (
                    <>
                      <div className="world-smoke pointer-events-none absolute left-[48%] top-[14%] h-10 w-4" />
                      <div className="world-room-glow pointer-events-none absolute left-[8%] top-[13%] h-24 w-24 rounded-full" />
                      <div className="world-hanging-lamp pointer-events-none absolute left-1/2 top-[9%] h-20 w-10 -translate-x-1/2" />
                      <div className="world-rug pointer-events-none absolute bottom-[12%] left-[40%] h-16 w-[24%]" />
                      <div className="world-papers pointer-events-none absolute left-[23%] top-[59%] h-10 w-14" />
                      <div className="world-plant pointer-events-none absolute right-[12%] bottom-[22%] h-24 w-16" />
                      <div className="world-furnace-glow pointer-events-none absolute left-[49%] top-[25%] h-28 w-28" />
                      <div className="world-ember-pop pointer-events-none absolute left-[51%] top-[34%] h-16 w-16" />
                      <div className="world-lamp-beam pointer-events-none absolute left-[48%] top-[18%] h-[38%] w-[22%]" />
                      <div className="world-tv-glow pointer-events-none absolute left-[19%] top-[51%] h-14 w-18" />
                      <div className="world-voxel-shadow pointer-events-none absolute bottom-[14%] left-[18%] h-8 w-[22%]" />
                      <div className="world-voxel-shadow pointer-events-none absolute bottom-[16%] right-[11%] h-8 w-[23%]" />
                    </>
                  ) : null}
                  {scene === "biz" ? (
                    <>
                      <div className="world-room-glow world-room-glow-wide pointer-events-none absolute right-[8%] top-[12%] h-24 w-32 rounded-full" />
                      <div className="world-hanging-lamp pointer-events-none absolute left-[27%] top-[8%] h-20 w-10" />
                      <div className="world-hanging-lamp pointer-events-none absolute right-[24%] top-[8%] h-20 w-10" />
                      <div className="world-ledger-lights pointer-events-none absolute left-[39%] top-[17%] h-4 w-[22%]" />
                      <div className="world-counter-items pointer-events-none absolute left-[47%] top-[64%] h-12 w-[20%]" />
                      <div className="world-crates pointer-events-none absolute right-[10%] bottom-[22%] h-20 w-20" />
                      <div className="world-sign-glow pointer-events-none absolute left-[33%] top-[15%] h-16 w-[34%]" />
                      <div className="world-ledger-scan pointer-events-none absolute left-[17%] top-[54%] h-28 w-[18%]" />
                      <div className="world-ledger-scan world-ledger-scan-delayed pointer-events-none absolute right-[10%] top-[56%] h-28 w-[18%]" />
                      <div className="world-monitor-flicker pointer-events-none absolute left-[42%] top-[56%] h-12 w-[17%]" />
                      <div className="world-city-glow pointer-events-none absolute inset-x-[8%] top-[13%] h-[26%]" />
                      <div className="world-voxel-shadow pointer-events-none absolute bottom-[15%] left-[42%] h-8 w-[28%]" />
                    </>
                  ) : null}

                  {HOTSPOTS[scene].map((hotspot) => {
                    const Icon = hotspot.icon;
                    const status = hotspotStatuses[hotspot.id as keyof typeof hotspotStatuses];

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
                        {status.count > 0 ? (
                          <span className={`world-hotspot-badge world-hotspot-badge-${status.tone}`}>
                            {status.count > 9 ? "9+" : status.count} new
                          </span>
                        ) : (
                          <span className="world-hotspot-badge world-hotspot-badge-default">clear</span>
                        )}
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
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleTaskAction(task)}
                                disabled={draftLoadingId === task.id}
                                className="rounded-[12px] border border-[color:var(--world-border)] bg-[color:var(--world-card-strong)] px-3 py-2 text-xs font-semibold text-[color:var(--world-ink)] transition hover:border-[color:var(--world-accent-soft)]"
                              >
                                {draftLoadingId === task.id && task.action ? "Generating..." : getTaskActionLabel(task)}
                              </button>
                              <button
                                type="button"
                                onClick={() => openTaskArea(task)}
                                className="rounded-[12px] border border-[color:var(--world-border)] bg-[color:var(--world-panel)] px-3 py-2 text-xs font-semibold text-[color:var(--world-ink)] transition hover:border-[color:var(--world-accent-soft)] hover:bg-[color:var(--world-card-strong)]"
                              >
                                Open task
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleResolveTask(task)}
                                disabled={done}
                                className="rounded-[12px] border border-[color:var(--world-border)] bg-[color:var(--world-panel)] px-3 py-2 text-xs font-semibold text-[color:var(--world-ink)] transition hover:border-[color:var(--world-accent-soft)] hover:bg-[color:var(--world-card-strong)] disabled:opacity-55"
                              >
                                {done ? "Done" : "Complete"}
                              </button>
                              {done ? (
                                <button
                                  type="button"
                                  onClick={() => handleUndoTask(task)}
                                  className="rounded-[12px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-3 py-2 text-xs font-semibold text-[color:var(--world-ink)] transition hover:border-[color:var(--world-accent-soft)] hover:bg-[color:var(--world-card-strong)]"
                                >
                                  Undo
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </PanelShell>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {goalModalOpen ? (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGoalModalOpen(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[color:var(--world-border)] bg-[color:var(--world-panel)] shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[color:var(--world-border)] px-6 py-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--world-muted)]">Goal setup</p>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--world-ink)]">Set New Goal</h2>
                  <p className="mt-1 text-sm text-[color:var(--world-muted)]">AI suggestions are based on the current ledger and can be replaced with your own target.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setGoalModalOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                {goalSuggestionsLoading ? (
                  <p className="text-sm text-[color:var(--world-muted)]">Loading suggestions...</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {goalSuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.type}-${suggestion.label}`}
                        type="button"
                        onClick={() => {
                          setSelectedGoalType(suggestion.type);
                          setSelectedGoalTarget(suggestion.target);
                          setSelectedGoalLabel(suggestion.label);
                        }}
                        className={`rounded-[18px] border px-4 py-4 text-left ${
                          selectedGoalType === suggestion.type && selectedGoalLabel === suggestion.label
                            ? "border-[color:var(--world-accent-2)] bg-[color:var(--world-card-strong)]"
                            : "border-[color:var(--world-border)] bg-[color:var(--world-card)]"
                        }`}
                      >
                        <p className="text-sm font-semibold text-[color:var(--world-ink)]">{suggestion.label}</p>
                        <p className="mt-2 text-xs leading-6 text-[color:var(--world-muted)]">{suggestion.rationale}</p>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--world-muted)]">Selected goal label</p>
                  <input
                    value={selectedGoalLabel}
                    onChange={(event) => setSelectedGoalLabel(event.target.value)}
                    className="w-full rounded-[16px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3 text-[color:var(--world-ink)] outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--world-muted)]">Target value</p>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={selectedGoalTarget}
                    onChange={(event) => setSelectedGoalTarget(Math.max(0, Number(event.target.value) || 0))}
                    className="w-full rounded-[16px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3 text-[color:var(--world-ink)] outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--world-muted)]">Write your own goal</p>
                  <textarea
                    value={customGoalText}
                    onChange={(event) => {
                      setCustomGoalText(event.target.value);
                      setSelectedGoalType("custom");
                      setSelectedGoalLabel(event.target.value || "Custom goal");
                    }}
                    rows={4}
                    className="w-full rounded-[16px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3 text-[color:var(--world-ink)] outline-none"
                    placeholder="Example: Collect every rent invoice within 3 days of due date."
                  />
                </div>
                <Button
                  type="button"
                  onClick={applyGoal}
                  className="w-full rounded-[16px] bg-[color:var(--world-accent)] text-[#1d140d] hover:bg-[color:var(--world-accent-2)]"
                >
                  Save goal
                </Button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {draftModal ? (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDraftModal(null)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[color:var(--world-border)] bg-[color:var(--world-panel)] shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[color:var(--world-border)] px-6 py-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--world-muted)]">AI email draft</p>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--world-ink)]">{draftModal.title}</h2>
                  <p className="mt-1 text-sm text-[color:var(--world-muted)]">{draftModal.customerName}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setDraftModal(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <div className="rounded-[18px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--world-muted)]">Subject</p>
                  <p className="mt-1 text-sm font-semibold text-[color:var(--world-ink)]">{draftModal.subject}</p>
                </div>
                <div className="rounded-[18px] border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--world-ink)]">{draftModal.body}</p>
                </div>
                <a
                  href={draftModal.gmailHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full justify-center rounded-[16px] bg-[color:var(--world-accent)] px-4 py-3 text-sm font-semibold text-[#1d140d] hover:bg-[color:var(--world-accent-2)]"
                >
                  Open in Gmail
                </a>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <WorldDetailSheet
        panel={panel}
        onClose={() => setPanel(null)}
        getInvoicePrimaryLabel={getInvoicePrimaryLabel}
        onInvoicePrimaryAction={handleInvoicePrimaryAction}
        onOpenTask={handleOpenTaskFromPanel}
        actionLoadingInvoiceId={invoiceActionLoadingId}
      />
    </div>
  );
}
