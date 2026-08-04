"use client";

/**
 * details-panel.tsx — anime details card with thumbnail, title, description,
 * genre, author, artist, status (colored), and a "Load Episodes" button.
 * Loads details via pgDetails when an anime is selected.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  X,
  ImageOff,
  ListVideo,
  Loader2,
  Tag,
  User,
  PenTool,
  CircleDot,
  ExternalLink,
} from "lucide-react";
import {
  pgDetails,
  pgEpisodes,
  type BrowseItem,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchAlert, WarningsAlert } from "./shared";
import { EpisodesList } from "./episodes-list";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function statusColor(status: string): { bg: string; text: string; dot: string } {
  const s = (status || "").toLowerCase();
  if (
    s.includes("complet") ||
    s.includes("finished") ||
    s.includes("ended")
  ) {
    return {
      bg: "bg-[var(--accent-teal-soft)]",
      text: "text-[var(--accent-teal)]",
      dot: "bg-[var(--accent-teal)]",
    };
  }
  if (
    s.includes("on going") ||
    s.includes("ongoing") ||
    s.includes("airing") ||
    s.includes("current")
  ) {
    return {
      bg: "bg-[var(--accent-indigo-soft)]",
      text: "text-[var(--accent-indigo)]",
      dot: "bg-[var(--accent-indigo)]",
    };
  }
  if (s.includes("hiatus") || s.includes("paused")) {
    return {
      bg: "bg-[var(--accent-amber-soft)]",
      text: "text-[var(--accent-amber)]",
      dot: "bg-[var(--accent-amber)]",
    };
  }
  if (s.includes("cancel")) {
    return {
      bg: "bg-[var(--accent-danger-soft)]",
      text: "text-[var(--accent-danger)]",
      dot: "bg-[var(--accent-danger)]",
    };
  }
  return {
    bg: "bg-[var(--surface-alt)]",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  };
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium text-foreground break-words">{value}</span>
      </div>
    </div>
  );
}

export function DetailsPanel({
  extensionId,
  anime,
  onClose,
  selectedEpisodeUrl,
  onPickEpisode,
}: {
  extensionId: string;
  anime: BrowseItem;
  onClose: () => void;
  selectedEpisodeUrl?: string;
  onPickEpisode: (url: string) => void;
}) {
  const [episodesOpen, setEpisodesOpen] = React.useState(false);

  const detailsQ = useQuery({
    queryKey: ["pg-details", extensionId, anime.url],
    queryFn: () => pgDetails(extensionId, anime.url),
    enabled: !!extensionId && !!anime.url,
  });

  const episodesQ = useQuery({
    queryKey: ["pg-episodes", extensionId, anime.url],
    queryFn: () => pgEpisodes(extensionId, anime.url),
    enabled: episodesOpen && !!extensionId && !!anime.url,
  });

  const d = detailsQ.data?.details;
  const status = d?.status || "";
  const sc = statusColor(status);

  const [thumbErr, setThumbErr] = React.useState(false);
  React.useEffect(() => {
    setThumbErr(false);
  }, [anime.url]);

  const thumbnail = d?.thumbnail || anime.thumbnail;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="rounded-3xl border-border bg-[var(--surface)] shadow-[var(--shadow)] gap-4">
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base font-semibold leading-tight">
              Details
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-8 w-8 shrink-0"
              onClick={onClose}
              aria-label="Close details"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FetchAlert
            fetch={detailsQ.data?.fetch ?? { ok: true, status: 0, url: "" }}
            title="Failed to load details"
          />
          <WarningsAlert warnings={detailsQ.data?.warnings} />

          {detailsQ.isLoading && (
            <div className="flex flex-col gap-4 sm:flex-row">
              <Skeleton className="aspect-[2/3] w-32 shrink-0 rounded-2xl bg-[var(--surface-alt)]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4 rounded bg-[var(--surface-alt)]" />
                <Skeleton className="h-3 w-1/2 rounded bg-[var(--surface-alt)]" />
                <Skeleton className="h-16 w-full rounded bg-[var(--surface-alt)]" />
                <Skeleton className="h-3 w-2/3 rounded bg-[var(--surface-alt)]" />
              </div>
            </div>
          )}

          {!detailsQ.isLoading && d && (
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* Thumbnail */}
              <div className="relative w-32 shrink-0 sm:w-36">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-[var(--surface-alt)] border border-border">
                  {thumbnail && !thumbErr ? (
                    <img
                      src={thumbnail}
                      alt={d.title}
                      onError={() => setThumbErr(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-7 w-7 opacity-50" />
                    </div>
                  )}
                </div>
                {status && (
                  <span
                    className={cn(
                      "absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm whitespace-nowrap",
                      sc.bg,
                      sc.text,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                    {status}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-2.5">
                <div>
                  <h3 className="text-base font-semibold leading-tight break-words">
                    {d.title || anime.title}
                  </h3>
                  {anime.url && (
                    <a
                      href={anime.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[var(--accent-indigo)] break-all"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-full">{anime.url}</span>
                    </a>
                  )}
                </div>

                {d.genre && (
                  <div className="flex items-start gap-2 text-xs">
                    <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex flex-wrap gap-1">
                      {d.genre
                        .split(/[,;]/)
                        .map((g) => g.trim())
                        .filter(Boolean)
                        .slice(0, 8)
                        .map((g, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="bg-[var(--surface-alt)] text-foreground font-normal rounded-full"
                          >
                            {g}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <DetailRow icon={User} label="Author" value={d.author} />
                  <DetailRow icon={PenTool} label="Artist" value={d.artist} />
                </div>

                {d.description && (
                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-6 whitespace-pre-wrap">
                    {d.description}
                  </p>
                )}

                {d.extras &&
                  Object.entries(d.extras).filter(([, v]) => v).length > 0 && (
                    <div className="rounded-xl bg-[var(--surface-alt)] p-2.5 text-[11px]">
                      <p className="mb-1 font-semibold text-foreground inline-flex items-center gap-1">
                        <CircleDot className="h-3 w-3" /> Extras
                      </p>
                      <div className="space-y-0.5">
                        {Object.entries(d.extras)
                          .filter(([, v]) => v)
                          .slice(0, 6)
                          .map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-muted-foreground">{k}:</span>
                              <span className="text-foreground break-words">{v}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEpisodesOpen(true);
                      if (!episodesQ.data) {
                        toast.info("Loading episodes…");
                      }
                    }}
                    disabled={episodesQ.isLoading}
                    className="rounded-xl bg-[var(--text-primary)] text-white hover:bg-[var(--text-primary)]/90 h-9"
                  >
                    {episodesQ.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ListVideo className="h-4 w-4" />
                    )}
                    {episodesOpen ? "Reload episodes" : "Load episodes"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {episodesOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.25 }}
              className="border-t border-border pt-4"
            >
              <h4 className="mb-3 text-sm font-semibold">Episodes</h4>
              <EpisodesList
                loading={episodesQ.isLoading}
                episodes={episodesQ.data?.episodes ?? []}
                fetch={
                  episodesQ.data?.fetch ?? {
                    ok: true,
                    status: 0,
                    url: "",
                  }
                }
                warnings={episodesQ.data?.warnings ?? []}
                selectedUrl={selectedEpisodeUrl}
                onPick={onPickEpisode}
              />
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
