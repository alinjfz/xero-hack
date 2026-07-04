"use client";

import { Flame } from "lucide-react";
import { buildWeekPills } from "@/lib/gamification";

type Props = {
  count: number;
  atRisk: boolean;
};

export function StreakCalendar({ count, atRisk }: Props) {
  const days = buildWeekPills();

  return (
    <div className="rounded-2xl border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flame className={`size-5 ${atRisk ? "text-orange-400 animate-pulse" : "text-[color:var(--world-accent)]"}`} />
          <div>
            <p className="text-sm font-semibold text-[color:var(--world-ink)]">{count} day streak</p>
            <p className="text-xs text-[color:var(--world-muted)]">
              {atRisk ? "Streak at risk — resolve an alert today" : "Keep showing up for your goal"}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {days.map((day) => (
          <div key={day.label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`h-8 w-full rounded-full border ${
                day.active
                  ? "border-[color:var(--world-accent)] bg-[color:var(--world-accent)]/25"
                  : "border-[color:var(--world-border)] bg-[color:var(--world-panel)]"
              }`}
            />
            <span className="text-[10px] uppercase tracking-wide text-[color:var(--world-muted)]">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
