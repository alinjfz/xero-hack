"use client";

import { Button } from "@/components/ui/button";
import type { WorldAlert } from "@/lib/world-summary";

type Props = {
  alerts: WorldAlert[];
  resolvedIds: string[];
  onResolve: (alertId: string) => void;
};

export function AlertCard({ alerts, resolvedIds, onResolve }: Props) {
  const openAlerts = alerts.filter((alert) => !resolvedIds.includes(alert.id));

  if (openAlerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {openAlerts.map((alert) => (
        <div
          key={alert.id}
          className="flex flex-col gap-3 rounded-2xl border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-medium text-[color:var(--world-ink)]">{alert.title}</p>
            <p className="mt-1 text-xs text-[color:var(--world-muted)]">{alert.body}</p>
          </div>
          <Button size="sm" onClick={() => onResolve(alert.id)}>
            Done
          </Button>
        </div>
      ))}
    </div>
  );
}
