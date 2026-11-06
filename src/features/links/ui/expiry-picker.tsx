"use client";

import { AlertCircleIcon, CheckIcon } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { customBounds, type ExpiryChoice } from "@/features/links/expiry-choice";

const CHOICES: { value: ExpiryChoice; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom" },
];

type ExpiryPickerProps = {
  choice: ExpiryChoice;
  onChoiceChange: (choice: ExpiryChoice) => void;
  customValue: string;
  onCustomChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
};

export function ExpiryPicker({
  choice,
  onChoiceChange,
  customValue,
  onCustomChange,
  error,
  disabled,
}: ExpiryPickerProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const customId = `${id}-custom`;
  const errorId = `${id}-error`;
  // Bounds depend on the clock, so they are taken when Custom is chosen (an
  // event), never during render, which keeps server and client markup equal.
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);

  function handleChoice(next: string) {
    // A single-choice group reports "" when the active chip is pressed again.
    // There is always a selection, so ignore it.
    if (next === "") return;
    if (next === "custom") setBounds(customBounds(new Date()));
    onChoiceChange(next as ExpiryChoice);
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm leading-none font-medium">
        Expires
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        value={choice}
        onValueChange={handleChoice}
        aria-labelledby={labelId}
        disabled={disabled}
        className="w-full flex-wrap"
      >
        {CHOICES.map(({ value, label }) => (
          <ToggleGroupItem key={value} value={value}>
            {choice === value && <CheckIcon aria-hidden />}
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {choice === "custom" && (
        <div className="mt-1 flex flex-col gap-2">
          <Label htmlFor={customId}>Expires at</Label>
          <Input
            id={customId}
            type="datetime-local"
            value={customValue}
            min={bounds?.min}
            max={bounds?.max}
            onChange={(event) => onCustomChange(event.target.value)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="sm:max-w-64"
          />
        </div>
      )}

      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-status-red-ink">
          <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
