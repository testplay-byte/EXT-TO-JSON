"use client";

/**
 * videos-section.tsx — multi-server video extraction panel.
 *
 * Renders EVERY server's notes / unsupported / error explicitly (never silent),
 * a video picker (flat list filtered by resolution/format), and the live
 * VideoPlayer for the selected video.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Server,
  AlertTriangle,
  AlertCircle,
  Play,
  ListVideo,
  Clapperboard,
  Film,
  Settings2,
} from "lucide-react";
import { pgVideos, type ExtractedVideo } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FetchAlert, WarningsAlert, EmptyState } from "./shared";
import { VideoPlayer } from "./video-player";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function filterVideos(
  videos: ExtractedVideo[],
  res: string,
  fmt: string,
): ExtractedVideo[] {
  return videos.filter((v) => {
    if (res !== "all" && v.quality !== res) return false;
    if (fmt !== "all" && v.format !== fmt) return false;
    return true;
  });
}

export function VideosSection({
  extensionId,
  episodeUrl,
}: {
  extensionId: string;
  episodeUrl: string;
}) {
  const q = useQuery({
    queryKey: ["pg-videos", extensionId, episodeUrl],
    queryFn: () => pgVideos(extensionId, episodeUrl),
    enabled: !!extensionId && !!episodeUrl,
  });

  const data = q.data;
  const [selectedVideo, setSelectedVideo] =
    React.useState<ExtractedVideo | null>(null);
  const [resFilter, setResFilter] = React.useState<string>("all");
  const [fmtFilter, setFmtFilter] = React.useState<string>("all");

  // Reset filters when extension/episode changes.
  React.useEffect(() => {
    setResFilter("all");
    setFmtFilter("all");
    setSelectedVideo(null);
  }, [extensionId, episodeUrl]);

  // Auto-pick first video when data loads (or when filters change and selection no longer matches).
  React.useEffect(() => {
    if (!data || data.allVideos.length === 0) {
      setSelectedVideo(null);
      return;
    }
    const filtered = filterVideos(data.allVideos, resFilter, fmtFilter);
    if (filtered.length === 0) {
      setSelectedVideo(null);
      return;
    }
    const stillValid = selectedVideo && filtered.some(
      (v) => v.url === selectedVideo.url && v.serverName === selectedVideo.serverName,
    );
    if (!stillValid) {
      setSelectedVideo(filtered[0]);
    }
  }, [data, resFilter, fmtFilter, selectedVideo]);

  const filtered = data
    ? filterVideos(data.allVideos, resFilter, fmtFilter)
    : [];

  return (
    <Card className="rounded-3xl border-border bg-[var(--surface)] shadow-[var(--shadow)] gap-4">
      <CardHeader className="pb-0">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]">
            <Clapperboard className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base leading-tight">Videos</CardTitle>
            <CardDescription className="text-[11px] leading-tight">
              Multi-server extraction results
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-xl bg-[var(--surface-alt)]" />
            <Skeleton className="h-28 w-full rounded-xl bg-[var(--surface-alt)]" />
            <Skeleton className="h-48 w-full rounded-xl bg-[var(--surface-alt)]" />
          </div>
        )}

        {data && <FetchAlert fetch={data.fetch} title="Failed to load videos" />}
        {data && <WarningsAlert warnings={data.warnings} />}

        {data && data.servers.length === 0 && data.fetch.ok && (
          <EmptyState
            title="No servers detected"
            description="This extension did not report any video servers for the episode."
            icon={ListVideo}
          />
        )}

        {/* Servers */}
        {data && data.servers.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Server className="h-3.5 w-3.5" />
              Servers ({data.servers.length})
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.servers.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.3) }}
                  className={cn(
                    "rounded-2xl border p-3 space-y-1.5",
                    s.unsupported
                      ? "border-[var(--accent-amber)]/40 bg-[var(--accent-amber-soft)]"
                      : s.error
                        ? "border-[var(--accent-danger)]/40 bg-[var(--accent-danger-soft)]"
                        : "border-border bg-[var(--surface)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-semibold">
                        {s.server.name}
                      </span>
                    </div>
                    {s.unsupported ? (
                      <Badge className="bg-[var(--accent-amber)] text-white text-[10px]">
                        unsupported
                      </Badge>
                    ) : s.error ? (
                      <Badge className="bg-[var(--accent-danger)] text-white text-[10px]">
                        error
                      </Badge>
                    ) : s.videos.length > 0 ? (
                      <Badge className="bg-[var(--accent-teal)] text-white text-[10px]">
                        {s.videos.length} video{s.videos.length === 1 ? "" : "s"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        empty
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>
                      Extractor:{" "}
                      <span className="font-mono text-foreground">
                        {s.server.extractor || "—"}
                      </span>
                    </span>
                    {s.server.qualities && s.server.qualities.length > 0 && (
                      <span>Qualities: {s.server.qualities.join(", ")}</span>
                    )}
                  </div>
                  {s.server.note && (
                    <p className="text-[11px] italic text-muted-foreground">
                      {s.server.note}
                    </p>
                  )}
                  {s.embedUrl && (
                    <p className="break-all text-[10px] text-muted-foreground">
                      Embed:{" "}
                      <a
                        href={s.embedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent-indigo)] hover:underline"
                      >
                        {s.embedUrl}
                      </a>
                    </p>
                  )}
                  {s.notes.map((n, j) => (
                    <div
                      key={j}
                      className="flex items-start gap-1.5 text-[11px] text-[var(--accent-amber)]"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{n}</span>
                    </div>
                  ))}
                  {s.error && (
                    <Alert
                      variant="destructive"
                      className="rounded-xl py-2"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      <AlertTitle className="text-xs">Extraction error</AlertTitle>
                      <AlertDescription className="text-[11px]">
                        {s.error}
                      </AlertDescription>
                    </Alert>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Picker + filters */}
        {data && data.allVideos.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5" />
              Pick a video
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={resFilter} onValueChange={setResFilter}>
                <SelectTrigger className="h-9 min-w-[140px] rounded-xl text-xs">
                  <SelectValue placeholder="Resolution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All resolutions</SelectItem>
                  {data.resolutions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fmtFilter} onValueChange={setFmtFilter}>
                <SelectTrigger className="h-9 min-w-[120px] rounded-xl text-xs">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All formats</SelectItem>
                  {data.formats.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground">
                {filtered.length} of {data.allVideos.length} videos
              </span>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="No videos match these filters"
                description="Try a different resolution or format."
              />
            ) : (
              <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                {filtered.map((v, i) => {
                  const isActive =
                    selectedVideo?.url === v.url &&
                    selectedVideo?.serverName === v.serverName;
                  return (
                    <motion.button
                      key={v.url + "::" + v.serverName + "::" + i}
                      type="button"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                      onClick={() => {
                        setSelectedVideo(v);
                        toast.success(
                          `Loaded: ${v.serverName} · ${v.quality || "default"}`,
                        );
                      }}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border bg-[var(--surface)] p-3 text-left transition-all lift-on-hover min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-indigo)]",
                        isActive
                          ? "border-[var(--accent-indigo)] bg-[var(--accent-indigo-soft)]"
                          : "border-border",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            isActive
                              ? "bg-[var(--accent-indigo)] text-white"
                              : "bg-[var(--surface-alt)] text-muted-foreground",
                          )}
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">
                            {v.quality || "Unknown quality"}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Film className="h-2.5 w-2.5" />
                              {v.serverName} · {v.format}
                            </span>
                          </p>
                        </div>
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-indigo)]">
                          Playing
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Player */}
        {selectedVideo && data && (
          <VideoPlayer
            key={selectedVideo.url + "::" + selectedVideo.serverName}
            video={selectedVideo}
            fallbackSubs={data.subtitleTracks}
            fallbackAudio={data.audioTracks}
          />
        )}
      </CardContent>
    </Card>
  );
}
