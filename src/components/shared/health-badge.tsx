"use client";

import { cn } from "@/lib/utils";
import type { HealthStatus, CheckStatus } from "@/lib/converter/types";

const healthStyles: Record<HealthStatus, { bg: string; text: string; dot: string; label: string }> = {
  healthy: {
    bg: "bg-[var(--accent-teal-soft)]",
    text: "text-[var(--accent-teal)]",
    dot: "bg-[var(--accent-teal)]",
    label: "Healthy",
  },
  warning: {
    bg: "bg-[var(--accent-amber-soft)]",
    text: "text-[var(--accent-amber)]",
    dot: "bg-[var(--accent-amber)]",
    label: "Warning",
  },
  error: {
    bg: "bg-[var(--accent-danger-soft)]",
    text: "text-[var(--accent-danger)]",
    dot: "bg-[var(--accent-danger)]",
    label: "Error",
  },
};

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
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
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
