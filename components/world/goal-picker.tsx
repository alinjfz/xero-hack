"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  GOAL_PRESETS,
  loadActiveGoal,
  saveActiveGoal,
  type ActiveGoal,
  type GoalType,
} from "@/lib/gamification";

type Props = {
  onGoalChange: (goal: ActiveGoal) => void;
  bankBalanceAvailable: boolean;
};

export function GoalPicker({ onGoalChange, bankBalanceAvailable }: Props) {
  const [active, setActive] = useState<ActiveGoal | null>(() => loadActiveGoal());
  const [customText, setCustomText] = useState(active?.customText ?? "");

  function selectGoal(type: GoalType) {
    const preset = GOAL_PRESETS.find((entry) => entry.type === type);
    if (!preset) {
      return;
    }

    if (type === "cash_buffer" && !bankBalanceAvailable) {
      return;
    }

    const goal: ActiveGoal = {
      type,
      label: preset.label,
      target: preset.defaultTarget,
      customText: type === "custom" ? customText || "My custom goal" : undefined,
      setAt: new Date().toISOString(),
    };

    setActive(goal);
    saveActiveGoal(goal);
    onGoalChange(goal);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {GOAL_PRESETS.map((preset) => {
          const disabled = preset.type === "cash_buffer" && !bankBalanceAvailable;
          const isActive = active?.type === preset.type;

          return (
            <Button
              key={preset.type}
              size="sm"
              variant={isActive ? "default" : "secondary"}
              disabled={disabled}
              onClick={() => selectGoal(preset.type)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      {active?.type === "custom" ? (
        <input
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          onBlur={() => selectGoal("custom")}
          placeholder="Describe your goal..."
          className="w-full rounded-xl border border-[color:var(--world-border)] bg-[color:var(--world-panel)] px-3 py-2 text-sm text-[color:var(--world-ink)] outline-none"
        />
      ) : null}
    </div>
  );
}
