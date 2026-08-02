"use client";

/**
 * episodes-list.tsx — scrollable list of episodes.
 * Surfaces fetch errors / warnings explicitly (never silent).
 */
import * as React from "react";
import { motion } from "framer-motion";
import { Hash, Calendar, Film, Loader2, ListVideo } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FetchAlert, WarningsAlert, EmptyState } from "./shared";
import { cn } from "@/lib/utils";
import type { EpisodeItem } from "@/lib/api";

function EpisodeRow({
  ep,
  selected,
  onPick,
  index,
}: {
  ep: EpisodeItem;
  selected?: boolean;
  onPick: (url: string) => void;
  index: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onPick(ep.url)}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.3) }}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border bg-[var(--surface)] p-3 text-left transition-all lift-on-hover outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-indigo)] min-h-[44px]",
        selected
          ? "border-[var(--accent-indigo)] bg-[var(--accent-indigo-soft)]"
          : "border-border hover:border-[var(--border-strong)]",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
          selected
            ? "bg-[var(--accent-indigo)] text-white"
            : "bg-[var(--surface-alt)] text-muted-foreground group-hover:text-foreground",
        )}
      >
        {ep.number > 0 ? ep.number : "–"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="line-clamp-2 text-sm font-medium leading-snug">
          {ep.name || `Episode ${ep.number || "?"}`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {ep.scanlator && (
            <span className="inline-flex items-center gap-1">
              <Film className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{ep.scanlator}</span>
            </span>
          )}
          {ep.date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {ep.date}
            </span>
          )}
          {ep.number > 0 && (
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {ep.number}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export function EpisodesList({
  loading,
  episodes,
  fetch,
  warnings,
  selectedUrl,
  onPick,
}: {
  loading: boolean;
  episodes: EpisodeItem[];
  fetch: { ok: boolean; status: number; url: string; error?: string };
  warnings: string[];
  selectedUrl?: string;
  onPick: (url: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <FetchAlert fetch={fetch} title="Failed to load episodes" />
      <WarningsAlert warnings={warnings} />
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl bg-[var(--surface-alt)]" />
          ))}
        </div>
      ) : episodes.length === 0 && fetch.ok ? (
        <EmptyState
          title="No episodes found"
          description="The extension returned an empty episode list."
          icon={ListVideo}
        />
      ) : (
        <ScrollArea className="max-h-96 w-full rounded-2xl">
          <div className="space-y-2 pr-2">
            {episodes.map((ep, i) => (
              <EpisodeRow
                key={ep.url + "::" + i}
                ep={ep}
                index={i}
                selected={selectedUrl === ep.url}
                onPick={onPick}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      {loading && (
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading episodes…
        </div>
      )}
    </div>
  );
}
