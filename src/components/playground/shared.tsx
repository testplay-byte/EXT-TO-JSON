"use client";

/**
 * shared.tsx — small reusable pieces for the PlaygroundView.
 * Every helper here is purely presentational except for surfacing backend
 * errors / warnings (which is a hard requirement: never silent).
 */
import * as React from "react";
import {
  AlertTriangle,
  AlertCircle,
  Inbox,
  Copy,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Capabilities } from "@/lib/converter/types";

export type FetchInfo = {
  ok: boolean;
  status: number;
  url: string;
  error?: string;
  blocked?: boolean;
  needsCaptcha?: boolean;
};

/** Copy text to clipboard with toast feedback. */
async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    // Simple feedback — no toast import here to keep shared.tsx lean.
    console.log(`[clipboard] Copied ${label}`);
  } catch {
    /* ignore */
  }
}

/**
 * Build a detailed error log string that the user can copy and share.
 */
function buildErrorLog(f: FetchInfo, title: string, warnings?: string[]): string {
  const lines = [
    `=== EXT-TO-JSON Playground Error Log ===`,
    `Time: ${new Date().toISOString()}`,
    `Title: ${title}`,
    ``,
    `--- Request ---`,
    `URL: ${f.url}`,
    `HTTP Status: ${f.status}`,
    `OK: ${f.ok}`,
    `Blocked: ${f.blocked ?? false}`,
    `Needs Captcha: ${f.needsCaptcha ?? false}`,
    ``,
    `--- Error ---`,
    f.error || `(no error message)`,
  ];
  if (warnings && warnings.length > 0) {
    lines.push(``, `--- Warnings ---`);
    warnings.forEach((w, i) => lines.push(`[${i + 1}] ${w}`));
  }
  lines.push(``, `=== End of log ===`);
  return lines.join("\n");
}

/** Rose alert for a failed request. Renders nothing when fetch.ok is true. */
export function FetchAlert({
  fetch: f,
  title = "Request failed",
  warnings,
}: {
  fetch: FetchInfo;
  title?: string;
  warnings?: string[];
}) {
  const [copied, setCopied] = React.useState(false);
  if (f.ok) return null;
  const isBlocked = f.blocked || f.status === 403;
  const is404 = f.status === 404;
  const isNetwork = f.status === 0;
  const alertTitle = isBlocked
    ? "Site blocked the request"
    : is404
      ? "Page not found (404)"
      : isNetwork
        ? "Network error"
        : title;

  const logText = buildErrorLog(f, alertTitle, warnings);

  return (
    <Alert
      variant="destructive"
      className="rounded-2xl border-[var(--accent-danger)]/40 bg-[var(--accent-danger-soft)] text-[var(--accent-danger)] [&>svg]:text-[var(--accent-danger)]"
    >
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>{alertTitle}</span>
        <button
          onClick={() => {
            copyToClipboard(logText, "error log").then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent-danger)]/30 px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--accent-danger)]/10"
          title="Copy error details to share for debugging"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy log
            </>
          )}
        </button>
      </AlertTitle>
      <AlertDescription className="text-[var(--accent-danger)]/90">
        <div className="break-words">{f.error || `HTTP ${f.status}`}</div>
        <div className="mt-1 break-all text-[11px] opacity-80">
          URL: <code className="font-mono">{f.url}</code>
        </div>
        <div className="mt-0.5 text-[11px] opacity-80">
          Status: <code className="font-mono">{f.status || "N/A"}</code>
        </div>
        {isBlocked && (
          <div className="mt-2 text-[11px] opacity-90">
            💡 Try: open the extension Settings (top-right) and pick a different
            domain, or visit the site in your browser first to pass any
            Cloudflare challenge.
          </div>
        )}
        {isNetwork && (
          <div className="mt-2 text-[11px] opacity-90">
            💡 This usually means the browser-fetch service (port 3030) is not
            running. Restart the dev server with <code className="font-mono">bun run dev</code>.
          </div>
        )}
        {warnings && warnings.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] opacity-80">
              {warnings.length} warning(s)
            </summary>
            <div className="mt-1 space-y-0.5 text-[11px] opacity-80">
              {warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          </details>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** Amber alert(s) for backend warnings. Renders nothing when warnings is empty. */
export function WarningsAlert({ warnings }: { warnings?: string[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <Alert
          key={i}
          className="rounded-2xl border-[var(--accent-amber)]/40 bg-[var(--accent-amber-soft)] text-[var(--accent-amber)] [&>svg]:text-[var(--accent-amber)]"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription className="text-[var(--accent-amber)]/90 whitespace-pre-wrap">
            {w}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

/** Compact list of capability chips. Off-capabilities are dimmed. */
export function CapabilitiesChips({ capabilities }: { capabilities: Capabilities | null }) {
  if (!capabilities) {
    return (
      <span className="text-[10px] text-muted-foreground">no capability info</span>
    );
  }
  const items: { label: string; on: boolean }[] = [
    { label: "Latest", on: !!capabilities.supportsLatest },
    { label: "Search", on: !!capabilities.supportsSearch },
    { label: "Filters", on: !!capabilities.supportsFilters },
    { label: "Episodes", on: !!capabilities.supportsEpisodes },
    { label: "Videos", on: !!capabilities.supportsVideos },
    { label: "Subs", on: !!capabilities.supportsSubtitles },
    { label: "Audio", on: !!capabilities.supportsAudioTracks },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span
          key={c.label}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
            c.on
              ? "bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]"
              : "bg-[var(--surface-alt)] text-muted-foreground line-through opacity-60",
          )}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-[var(--surface)] p-10 text-center animate-fade-in">
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-alt)] text-muted-foreground">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Card skeleton for browse/search grids. */
export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-[var(--surface)] p-2.5 shadow-[var(--shadow)]">
      <Skeleton className="aspect-[2/3] w-full rounded-xl bg-[var(--surface-alt)]" />
      <Skeleton className="h-3 w-5/6 rounded bg-[var(--surface-alt)]" />
      <Skeleton className="h-2.5 w-3/5 rounded bg-[var(--surface-alt)]" />
    </div>
  );
}

/** Loading pill that fades in to avoid flicker. */
export function LoadingPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-teal)]" />
      {label}
    </div>
  );
}

export { Inbox };
