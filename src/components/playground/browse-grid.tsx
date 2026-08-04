"use client";

/**
 * browse-grid.tsx — reusable grid of anime cards.
 * Used by both the Browse tab and the Search tab.
 */
import * as React from "react";
import { motion } from "framer-motion";
import { ImageOff, Play } from "lucide-react";
import type { BrowseItem } from "@/lib/api";
import { CardSkeleton, EmptyState } from "./shared";
import { cn } from "@/lib/utils";

function hostname(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}

function BrowseCard({
  item,
  index,
  onSelect,
  selected,
}: {
  item: BrowseItem;
  index: number;
  onSelect: (item: BrowseItem) => void;
  selected?: boolean;
}) {
  const [imgError, setImgError] = React.useState(false);
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(item)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.025, 0.3) }}
      whileHover={{ y: -3 }}
      aria-label={`Open ${item.title || "anime"}`}
      className={cn(
        "group flex flex-col text-left rounded-2xl border bg-[var(--surface)] overflow-hidden lift-on-hover shadow-[var(--shadow)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-indigo)] min-h-[11px]",
        selected
          ? "border-[var(--accent-indigo)] ring-2 ring-[var(--accent-indigo)]/30"
          : "border-border",
      )}
    >
      <div className="relative aspect-[2/3] w-full bg-[var(--surface-alt)] overflow-hidden">
        {item.thumbnail && !imgError ? (
          <img
            src={item.thumbnail}
            alt={item.title || "anime thumbnail"}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-7 w-7 opacity-50" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-70" />
        <div className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-[var(--accent-indigo)] opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <Play className="h-3.5 w-3.5 fill-current" />
        </div>
      </div>
      <div className="flex flex-col gap-1 p-2.5">
        <p className="line-clamp-2 text-xs font-semibold leading-snug">
          {item.title || "Untitled"}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {hostname(item.url)}
        </p>
      </div>
    </motion.button>
  );
}

export function BrowseGrid({
  items,
  onSelect,
  loading,
  selectedUrl,
  emptyTitle = "No results",
  emptyDescription = "Try a different query or page.",
  skeletonCount = 12,
}: {
  items: BrowseItem[];
  onSelect: (item: BrowseItem) => void;
  loading?: boolean;
  selectedUrl?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  skeletonCount?: number;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 stagger">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {items.map((item, i) => (
        <BrowseCard
          key={item.url + "::" + i}
          item={item}
          index={i}
          onSelect={onSelect}
          selected={selectedUrl === item.url}
        />
      ))}
    </div>
  );
}
