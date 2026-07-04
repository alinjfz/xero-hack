import type { ActiveGoal } from "@/lib/gamification";
import type { WorldSnapshot, WorldSummaryResponse } from "@/lib/world-summary";

const TIPS = {
  sunny: [
    "Rather civilised today. Try not to ruin it with impulse stationery orders.",
    "Cash flow looks acceptable. I shall reserve further judgment.",
    "All quiet on the fiscal front. Suspicious, but I'll allow it.",
  ],
  cloudy: [
    "A few invoices need attention. Nothing a stiff email won't fix.",
    "Some bills are circling. Best glance at them before they land.",
    "Not a crisis yet. The boring sort of week, which is rather the point.",
  ],
  stormy: [
    "Someone owes you money and appears to be enjoying it. Rude.",
    "Overdue invoices detected. Time for the polite-but-firm voice.",
    "The numbers are cross. Shall we chase Alex before the kettle boils?",
  ],
};

export function pickMascotTip(params: {
  summary: Extract<WorldSummaryResponse, { connected: true }>;
  goal: ActiveGoal | null;
  resolvedCount: number;
}) {
  const home = params.summary.worlds.find((world) => world.id === "home");
  const biz = params.summary.worlds.find((world) => world.id === "biz");
  const health = [home, biz].some((world) => world?.health === "stormy")
    ? "stormy"
    : [home, biz].some((world) => world?.health === "cloudy")
      ? "cloudy"
      : "sunny";

  const overdue = params.summary.combined.overdueCount;
  if (overdue > 0 && home?.overdue.length) {
    const rent = home.overdue[0];
    return `Alex still owes you ${formatPlain(rent.amountDue)}. Politely terrifying, I'd say.`;
  }

  const printAlert = biz?.alerts.find((alert) => alert.id === "biz-printco-overcharge");
  if (printAlert) {
    return "PrintCo's bill looks a touch ambitious. Shall we have words?";
  }

  if (params.goal?.type === "revenue_target") {
    const current = biz?.metrics.revenueThisMonth ?? 0;
    return `You're at ${formatPlain(current)} toward your target. Not dreadful. Not brilliant either.`;
  }

  if (params.goal?.type === "zero_overdue" && overdue > 0) {
    return `${overdue} overdue invoice${overdue === 1 ? "" : "s"} still lurking. Tick one off for the streak.`;
  }

  if (params.resolvedCount > 0) {
    return "Good. One fewer thing for me to sigh about.";
  }

  const pool = TIPS[health];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function tipForWorld(world: WorldSnapshot) {
  if (world.id === "home" && world.overdue.length > 0) {
    return "The tenant's rent is late. The house is fine; the ledger is not.";
  }

  if (world.id === "biz" && world.metrics.draftCount > 0) {
    return `${world.metrics.draftCount} draft invoice${world.metrics.draftCount === 1 ? "" : "s"} sitting idle. Send one and call it progress.`;
  }

  if (world.health === "sunny") {
    return world.id === "home" ? "Rent's behaving. The garden approves." : "Clients are paying. Uncharacteristically pleasant.";
  }

  return world.id === "home" ? "Property bills on the horizon. Peek at the shed." : "Open the shop counter and see who's owing what.";
}

function formatPlain(amount: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}
