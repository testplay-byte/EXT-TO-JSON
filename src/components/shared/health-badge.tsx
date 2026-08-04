"use client";

import { cn } from "@/lib/utils";
import type { HealthStatus, CheckStatus } from "@/lib/converter/types";

const healthStyles: Record<HealthStatus, { bg: string; text: string; dot: string; label: string; meaning: string }> = {
  healthy: {
    bg: "bg-[var(--accent-teal-soft)]",
    text: "text-[var(--accent-teal)]",
    dot: "bg-[var(--accent-teal)]",
    label: "Healthy",
    meaning:
      "All conversion checks passed. The APK was fully converted to JSON — every endpoint, selector, and capability was extracted successfully.",
  },
  warning: {
    bg: "bg-[var(--accent-amber-soft)]",
    text: "text-[var(--accent-amber)]",
    dot: "bg-[var(--accent-amber)]",
    label: "Partial",
    meaning:
      "Most of the APK was converted, but some checks found gaps (e.g. a missing display name, an endpoint without a selector, or no detected video servers). The JSON is still usable — open the details page to see exactly which checks need attention.",
  },
  error: {
    bg: "bg-[var(--accent-danger-soft)]",
    text: "text-[var(--accent-danger)]",
    dot: "bg-[var(--accent-danger)]",
    label: "Incomplete",
    meaning:
      "Critical parts of the conversion failed (e.g. the Source class could not be located, or the base URL is missing). The JSON will have limited functionality — open the details page to see what went wrong.",
  },
};

/**
 * Health badge with a native tooltip explaining what the status + score mean.
 * Hover (or long-press on touch) to read the explanation.
 */
export function HealthBadge({
  status,
  score,
  className,
}: {
  status: HealthStatus;
  score?: number;
  className?: string;
}) {
  const s = healthStyles[status];
  const tooltip =
    `Conversion health: ${score ?? "?"}% — ${s.label}.\n` + s.meaning;

  return (
    <span
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold cursor-help",
        s.bg,
        s.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, status === "healthy" && "animate-pulse-soft")} />
      {s.label}
      {score !== undefined && <span className="opacity-70">· {score}%</span>}
    </span>
  );
}

const checkStyles: Record<CheckStatus, { icon: string; color: string }> = {
  pass: { icon: "✓", color: "text-[var(--accent-teal)]" },
  warn: { icon: "!", color: "text-[var(--accent-amber)]" },
  fail: { icon: "✕", color: "text-[var(--accent-danger)]" },
  skip: { icon: "–", color: "text-muted-foreground" },
};

export function CheckMark({ status }: { status: CheckStatus }) {
  const s = checkStyles[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        status === "pass" && "bg-[var(--accent-teal-soft)]",
        status === "warn" && "bg-[var(--accent-amber-soft)]",
        status === "fail" && "bg-[var(--accent-danger-soft)]",
        status === "skip" && "bg-[var(--surface-alt)]",
        s.color,
      )}
    >
      {s.icon}
    </span>
  );
}
