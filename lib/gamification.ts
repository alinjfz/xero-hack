import type { WorldSummaryResponse } from "@/lib/world-summary";

export type GoalType =
  | "revenue_target"
  | "zero_overdue"
  | "cash_buffer"
  | "rent_collected"
  | "custom";

export type ActiveGoal = {
  type: GoalType;
  label: string;
  target: number;
  customText?: string;
  setAt: string;
};

export type StreakState = {
  count: number;
  lastActionDate: string | null;
  weekFreezeAvailable: boolean;
  history: string[];
  resolvedAlertIds: string[];
};

const GOAL_KEY = "kish_world_goals";
const STREAK_KEY = "kish_world_streak";
const BASELINE_KEY = "kish_world_goal_baseline";

export const GOAL_PRESETS: Array<{ type: GoalType; label: string; defaultTarget: number }> = [
  { type: "revenue_target", label: "Earn £5k this month", defaultTarget: 5000 },
  { type: "zero_overdue", label: "Clear all overdue", defaultTarget: 0 },
  { type: "cash_buffer", label: "Keep £10k in the bank", defaultTarget: 10000 },
  { type: "rent_collected", label: "Rent collected on time", defaultTarget: 100 },
  { type: "custom", label: "Custom goal", defaultTarget: 100 },
];

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadActiveGoal(): ActiveGoal | null {
  const raw = readJson<any>(GOAL_KEY, null);
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw as ActiveGoal;
}

export function saveActiveGoal(goal: ActiveGoal) {
  writeJson(GOAL_KEY, goal);
  writeJson(BASELINE_KEY, null);
}

export function loadActiveGoals(): ActiveGoal[] {
  const raw = readJson<any>(GOAL_KEY, null);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ActiveGoal[];
  return [raw as ActiveGoal];
}

export function saveActiveGoals(goals: ActiveGoal[]) {
  writeJson(GOAL_KEY, goals);
  writeJson(BASELINE_KEY, null);
}

export function loadStreakState(): StreakState {
  return readJson<StreakState>(STREAK_KEY, {
    count: 0,
    lastActionDate: null,
    weekFreezeAvailable: true,
    history: [],
    resolvedAlertIds: [],
  });
}

export function saveStreakState(state: StreakState) {
  writeJson(STREAK_KEY, state);
}

export function computeGoalProgress(
  goal: ActiveGoal | null,
  summary: Extract<WorldSummaryResponse, { connected: true }>,
) {
  if (!goal) {
    return { current: 0, target: 1, percent: 0, label: "Pick a goal to begin" };
  }

  const home = summary.worlds.find((world) => world.id === "home");
  const biz = summary.worlds.find((world) => world.id === "biz");

  switch (goal.type) {
    case "revenue_target": {
      const current = biz?.metrics.revenueThisMonth ?? 0;
      const percent = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
      return { current, target: goal.target, percent, label: goal.label };
    }
    case "zero_overdue": {
      const current = summary.combined.overdueCount;
      const percent = current === 0 ? 100 : Math.max(0, 100 - current * 25);
      return { current, target: 0, percent, label: goal.label };
    }
    case "cash_buffer": {
      const current = summary.combined.bankBalance ?? 0;
      const percent = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
      return { current, target: goal.target, percent, label: goal.label };
    }
    case "rent_collected": {
      const rentDue = home?.receivables.length ?? 0;
      const rentOverdue = home?.overdue.length ?? 0;
      const percent = rentDue === 0 ? 100 : Math.round(((rentDue - rentOverdue) / rentDue) * 100);
      return { current: percent, target: 100, percent, label: goal.label };
    }
    case "custom":
    default:
      return { current: 50, target: 100, percent: 50, label: goal.customText ?? goal.label };
  }
}

export function recordStreakAction(reason: "alert" | "progress", alertId?: string) {
  const state = loadStreakState();
  const today = todayKey();

  if (alertId) {
    if (!state.resolvedAlertIds.includes(alertId)) {
      state.resolvedAlertIds = [...state.resolvedAlertIds, alertId];
    }
  }

  if (state.lastActionDate === today) {
    saveStreakState(state);
    return state;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const continued = state.lastActionDate === yesterdayKey;

  state.count = continued ? state.count + 1 : 1;
  state.lastActionDate = today;
  state.history = [...state.history.filter((day) => day !== today), today].slice(-7);

  if (reason === "progress") {
    // no-op marker for future analytics
  }

  saveStreakState(state);
  return state;
}

export function isStreakAtRisk() {
  const state = loadStreakState();
  const today = todayKey();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()),
  );

  return state.count > 0 && state.lastActionDate !== today && hour >= 20;
}

export function buildWeekPills() {
  const state = loadStreakState();
  const days: Array<{ label: string; active: boolean }> = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    days.push({
      label: date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" }),
      active: state.history.includes(key) || state.lastActionDate === key,
    });
  }

  return days;
}
