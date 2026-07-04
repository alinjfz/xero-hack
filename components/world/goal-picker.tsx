"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format-currency";
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
  currency: string | null;
};

const PICKER_PRESETS = GOAL_PRESETS.filter((preset) => preset.type !== "custom");

function buildGoalLabel(type: GoalType, target: number, currency: string | null) {
  switch (type) {
    case "revenue_target":
      return `Earn ${formatCurrency(target, currency)} this month`;
    case "cash_buffer":
      return `Reach ${formatCurrency(target, currency)} in cash reserve`;
    case "zero_overdue":
      return "Clear every overdue invoice";
    case "rent_collected":
      return "Collect rent on time";
    default:
      return "Set a custom quest";
  }
}

export function GoalPicker({ onGoalChange, bankBalanceAvailable, currency }: Props) {
  const active = useMemo(() => loadActiveGoal(), []);
  const [selectedType, setSelectedType] = useState<GoalType>(active?.type === "custom" ? "revenue_target" : (active?.type ?? "revenue_target"));
  const [target, setTarget] = useState<number>(Math.max(100, active?.target ?? 5000));

  const selectedPreset = PICKER_PRESETS.find((entry) => entry.type === selectedType) ?? PICKER_PRESETS[0];
  const needsTarget = selectedType === "revenue_target" || selectedType === "cash_buffer";
  const disabled = selectedType === "cash_buffer" && !bankBalanceAvailable;
  const previewTarget = needsTarget ? target : selectedPreset.defaultTarget;
  const previewLabel = buildGoalLabel(selectedType, previewTarget, currency);

  function handleSelect(type: GoalType) {
    setSelectedType(type);
    const preset = PICKER_PRESETS.find((entry) => entry.type === type);
    if (preset && (type !== "revenue_target" && type !== "cash_buffer")) {
      setTarget(preset.defaultTarget);
    }
  }

  function handleSave() {
    if (disabled) {
      return;
    }

    const goal: ActiveGoal = {
      type: selectedType,
      label: previewLabel,
      target: previewTarget,
      setAt: new Date().toISOString(),
    };

    saveActiveGoal(goal);
    onGoalChange(goal);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {PICKER_PRESETS.map((preset) => {
          const isActive = preset.type === selectedType;
          const isDisabled = preset.type === "cash_buffer" && !bankBalanceAvailable;

          return (
            <button
              key={preset.type}
              type="button"
              disabled={isDisabled}
              onClick={() => handleSelect(preset.type)}
              className={`rounded-[18px] border px-3 py-3 text-left transition ${
                isActive
                  ? "border-[color:var(--world-accent-2)] bg-[color:var(--world-card-strong)] shadow-[0_0_0_2px_rgba(246,200,90,0.18)]"
                  : "border-[color:var(--world-border)] bg-[color:var(--world-card)] hover:border-[color:var(--world-accent-soft)]"
              } ${isDisabled ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--world-muted)]">Quest</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--world-ink)]">{buildGoalLabel(preset.type, preset.defaultTarget, currency)}</p>
            </button>
          );
        })}
      </div>

      {needsTarget ? (
        <div className="space-y-2">
          <label htmlFor="world-goal-target" className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--world-muted)]">
            Target value
          </label>
          <input
            id="world-goal-target"
            type="number"
            min={100}
            step={100}
            value={target}
            onChange={(event) => setTarget(Math.max(100, Number(event.target.value) || 100))}
            className="w-full rounded-[16px] border border-[color:var(--world-border)] bg-[color:var(--world-panel)] px-4 py-3 text-base text-[color:var(--world-ink)] outline-none"
          />
        </div>
      ) : null}

      <div className="rounded-[18px] border border-[color:var(--world-border)] bg-[color:var(--world-panel)] px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--world-muted)]">Selected quest</p>
        <p className="mt-1 text-sm font-semibold text-[color:var(--world-ink)]">{previewLabel}</p>
      </div>

      <Button
        type="button"
        onClick={handleSave}
        className="w-full rounded-[16px] bg-[color:var(--world-accent)] text-[#1d140d] hover:bg-[color:var(--world-accent-2)]"
      >
        Lock in quest
      </Button>
    </div>
  );
}
