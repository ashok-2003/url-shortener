import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  amber: { box: "bg-status-amber-bg text-status-amber-ink", dot: "bg-status-amber-dot" },
  neutral: { box: "bg-status-neutral-bg text-status-neutral-ink", dot: "bg-status-neutral-dot" },
  red: { box: "bg-status-red-bg text-status-red-ink", dot: "bg-status-red-dot" },
} as const;

export function StatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
}) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        t.box,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
      {children}
    </span>
  );
}
