"use client";

/**
 * video-player.tsx — HTML5 <video> player wired up with:
 *   - hls.js (dynamically imported) for m3u8 sources
 *   - direct src for mp4 / mkv
 *   - .srt → .vtt conversion (client-side, via Blob URL) so <track> can render it
 *   - subtitle styling injected through a <style> tag targeting video#pg-video::cue
 *   - vertical position applied to VTTCue.line (snapToLines = false => percentage)
 *   - audio tracks: attempt HTML5 video.audioTracks API; if absent, surface the
 *     track URLs explicitly with a "browser limitation" note (never silent)
 */
import * as React from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  AlertCircle,
  Volume2,
  AlertTriangle,
  Film,
  ExternalLink,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ExtractedVideo } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SubtitlePanel,
  DEFAULT_SUBTITLE_STYLE,
  hexToRgba,
  type SubtitleStyle,
} from "./subtitle-panel";

type SubtitleTrack = { url: string; lang: string; format?: string };
type AudioTrack = { url: string; lang: string };

interface SubSrc {
  src: string;
  label: string;
  lang: string;
  isBlob: boolean;
  fetchError?: string;
}

/** Convert SRT timestamp separators (,) to VTT (.) and prepend WEBVTT header. */
function srtToVtt(srt: string): string {
  const trimmed = srt.replace(/\r+/g, "").trim();
  const withHeader = "WEBVTT\n\n" + trimmed + "\n";
  // SRT cue timestamps use a comma before the millis; VTT uses a dot.
  return withHeader.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    "$1.$2 --> $3.$4",
  );
}

export function VideoPlayer({
  video,
  fallbackSubs,
  fallbackAudio,
}: {
  video: ExtractedVideo;
  fallbackSubs: SubtitleTrack[];
  fallbackAudio: AudioTrack[];
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<any>(null);

  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const subs: SubtitleTrack[] =
    video.subtitleTracks && video.subtitleTracks.length
      ? video.subtitleTracks
      : fallbackSubs;
  const audios: AudioTrack[] =
    video.audioTracks && video.audioTracks.length
      ? video.audioTracks
      : fallbackAudio;

  const [style, setStyle] = React.useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [activeSubIdx, setActiveSubIdx] = React.useState<number>(
    subs.length ? 0 : -1,
  );
  const [subSrcs, setSubSrcs] = React.useState<SubSrc[]>([]);

  const [audioSupported, setAudioSupported] = React.useState<boolean | null>(
    null,
  );
  const [audioTrackCount, setAudioTrackCount] = React.useState<number>(0);
  const [activeAudioIdx, setActiveAudioIdx] = React.useState<number>(-1);

  // Reset active subtitle when the subtitle list changes.
  React.useEffect(() => {
    setActiveSubIdx(subs.length ? 0 : -1);
  }, [subs]);

  // Convert SRT tracks to VTT Blob URLs.
  React.useEffect(() => {
    let cancelled = false;
    const blobUrls: string[] = [];
    const convs = subs.map(async (s): Promise<SubSrc> => {
      const fmt = (s.format || "").toLowerCase();
      const url = s.url || "";
      const isSrt = url.toLowerCase().endsWith(".srt") || fmt === "srt";
      if (!isSrt) {
        return { src: url, label: s.lang || "Subtitle", lang: s.lang, isBlob: false };
      }
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const vtt = srtToVtt(text);
        const blob = new Blob([vtt], { type: "text/vtt" });
        const blobUrl = URL.createObjectURL(blob);
        blobUrls.push(blobUrl);
        return { src: blobUrl, label: s.lang || "Subtitle", lang: s.lang, isBlob: true };
      } catch (e: any) {
        return {
          src: url,
          label: s.lang || "Subtitle",
          lang: s.lang,
          isBlob: false,
          fetchError: e?.message || String(e),
        };
      }
    });
    Promise.all(convs).then((out) => {
      if (!cancelled) setSubSrcs(out);
    });
    return () => {
      cancelled = true;
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [subs]);

  // Inject ::cue styling into <head>.
  React.useEffect(() => {
    const id = "pg-cue-style";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    const bg = hexToRgba("#000000", style.bgOpacity);
    el.textContent =
      `video#pg-video::cue {\n` +
      `  color: ${style.textColor};\n` +
      `  background-color: ${bg};\n` +
      `  font-family: ${style.fontFamily};\n` +
      `  font-size: ${style.fontSize}px;\n` +
      `  line-height: 1.2;\n` +
      `}`;
  }, [style]);

  // Setup video source (hls.js for m3u8, direct src for mp4/mkv).
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Capture as a non-null typed const so TS keeps the narrowing across `await`
    // and inside async closures (which it otherwise drops).
    const videoEl: HTMLVideoElement = v;
    setLoadError(null);
    setLoading(true);

    let hls: any = null;
    let destroyed = false;

    async function setup() {
      try {
        if (video.format === "m3u8") {
          const Hls = (await import("hls.js")).default;
          if (destroyed) return;
          if (Hls.isSupported()) {
            hls = new Hls({ enableWorker: true });
            hlsRef.current = hls;
            hls.loadSource(video.url);
            hls.attachMedia(videoEl);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setLoading(false);
              videoEl.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
              if (data?.fatal) {
                setLoadError(`HLS error: ${data.details || data.type}`);
                setLoading(false);
              }
            });
          } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
            videoEl.src = video.url;
          } else {
            setLoadError("HLS playback is not supported in this browser.");
            setLoading(false);
          }
        } else if (video.format === "mp4" || video.format === "mkv") {
          videoEl.src = video.url;
        } else {
          setLoadError(
            `Unsupported video format: ${video.format || "unknown"}. ` +
              `This playground only plays m3u8/mp4/mkv directly.`,
          );
          setLoading(false);
        }
      } catch (e: any) {
        setLoadError(e?.message || String(e));
        setLoading(false);
      }
    }
    setup();

    return () => {
      destroyed = true;
      if (hls) {
        try {
          hls.destroy();
        } catch {}
        hlsRef.current = null;
      }
      try {
        videoEl.removeAttribute("src");
        videoEl.load();
      } catch {}
    };
  }, [video.url, video.format]);

  // Detect audio tracks once metadata is loaded.
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoadedMetadata = () => {
      const at = (v as any).audioTracks;
      if (at && at.length > 0) {
        setAudioSupported(true);
        setAudioTrackCount(at.length);
        setActiveAudioIdx(0);
      } else {
        setAudioSupported(false);
        setAudioTrackCount(0);
      }
    };
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => v.removeEventListener("loadedmetadata", onLoadedMetadata);
  }, [video.url, video.format]);

  // Apply subtitle mode + cue positions.
  const applySubtitles = React.useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      t.mode = i === activeSubIdx ? "showing" : "hidden";
      if (t.cues) {
        for (let j = 0; j < t.cues.length; j++) {
          const cue = t.cues[j] as VTTCue;
          cue.snapToLines = false;
          if (style.position === "top") cue.line = 8;
          else if (style.position === "middle") cue.line = 50;
          else cue.line = 92;
        }
      }
    }
  }, [activeSubIdx, style.position]);

  React.useEffect(() => {
    applySubtitles();
  }, [applySubtitles, subSrcs]);

  const onTrackLoad = React.useCallback(() => {
    applySubtitles();
  }, [applySubtitles]);

  const switchAudio = (idx: number) => {
    const v = videoRef.current;
    if (!v) return;
    const at = (v as any).audioTracks;
    if (at && at.length > 0 && idx < at.length) {
      for (let i = 0; i < at.length; i++) at[i].enabled = i === idx;
      setActiveAudioIdx(idx);
      return;
    }
    const hls = hlsRef.current;
    if (hls && hls.audioTracks && hls.audioTracks.length > idx) {
      hls.audioTrack = hls.audioTracks[idx].id;
      setActiveAudioIdx(idx);
    }
  };

  const subFetchErrors = subSrcs.filter((s) => s.fetchError);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Video element */}
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-2xl bg-[#0f0f10] border border-border shadow-[var(--shadow-elevated)]">
          <video
            id="pg-video"
            ref={videoRef}
            controls
            playsInline
            className="block h-auto w-full max-h-[60vh] bg-[#0f0f10]"
            onError={(e) => {
              const v = e.currentTarget;
              const err = v.error;
              setLoadError(
                err
                  ? `Video error (code ${err.code}): ${err.message || "playback failed"}`
                  : "Unknown video error",
              );
              setLoading(false);
            }}
            onWaiting={() => setLoading(true)}
            onPlaying={() => {
              setLoading(false);
              setLoadError(null);
            }}
            onCanPlay={() => setLoading(false)}
          >
            {subSrcs.map((s, i) => (
              <track
                key={i}
                kind="subtitles"
                src={s.src || undefined}
                srcLang={s.lang || undefined}
                label={s.label}
                default={i === activeSubIdx && activeSubIdx >= 0}
                onLoad={onTrackLoad}
              />
            ))}
          </video>
          {loading && !loadError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading video…
              </div>
            </div>
          )}
        </div>

        {loadError && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-[var(--accent-danger)]/40 bg-[var(--accent-danger-soft)] text-[var(--accent-danger)] [&>svg]:text-[var(--accent-danger)]"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Playback error</AlertTitle>
            <AlertDescription className="text-[var(--accent-danger)]/90">
              {loadError}
            </AlertDescription>
          </Alert>
        )}

        {/* Subtitle fetch errors (SRT → VTT failures) */}
        {subFetchErrors.length > 0 && (
          <Alert className="rounded-2xl border-[var(--accent-amber)]/40 bg-[var(--accent-amber-soft)] text-[var(--accent-amber)] [&>svg]:text-[var(--accent-amber)]">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Subtitle fetch failed</AlertTitle>
            <AlertDescription className="text-[var(--accent-amber)]/90">
              <ul className="list-disc pl-4 space-y-0.5">
                {subFetchErrors.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.label}:</span> {s.fetchError}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Video meta chips */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-indigo-soft)] px-2 py-0.5 font-mono text-[var(--accent-indigo)]">
            <Film className="h-3 w-3" /> {video.format}
          </span>
          {video.quality && (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5">
              {video.quality}
            </span>
          )}
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5">
            {video.serverName}
          </span>
          {video.note && (
            <span className="rounded-full bg-[var(--accent-amber-soft)] px-2 py-0.5 text-[var(--accent-amber)]">
              {video.note}
            </span>
          )}
        </div>

        <div className="rounded-xl bg-[var(--surface-alt)] p-2.5 text-[11px] break-all">
          <span className="text-muted-foreground">URL: </span>
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-start gap-1 font-mono text-foreground hover:text-[var(--accent-indigo)]"
          >
            <span className="break-all">{video.url}</span>
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
          </a>
        </div>

        {video.headers && Object.keys(video.headers).length > 0 && (
          <div className="rounded-xl bg-[var(--surface-alt)] p-2.5 text-[11px]">
            <p className="mb-1 text-muted-foreground">
              Headers (advisory — not applied by browser sandbox):
            </p>
            <pre className="font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(video.headers, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Audio + subtitle panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AudioTracksPanel
          audios={audios}
          audioSupported={audioSupported}
          trackCount={audioTrackCount}
          activeIdx={activeAudioIdx}
          onSwitch={switchAudio}
        />
        <SubtitlePanel
          style={style}
          onStyleChange={setStyle}
          tracks={subs}
          activeIdx={activeSubIdx}
          onActiveChange={setActiveSubIdx}
        />
      </div>
    </motion.div>
  );
}

function AudioTracksPanel({
  audios,
  audioSupported,
  trackCount,
  activeIdx,
  onSwitch,
}: {
  audios: AudioTrack[];
  audioSupported: boolean | null;
  trackCount: number;
  activeIdx: number;
  onSwitch: (idx: number) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-border bg-[var(--surface)] p-4 shadow-[var(--shadow)] space-y-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]">
          <Volume2 className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-sm font-semibold leading-tight">Audio tracks</h4>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {audios.length === 0
              ? "No audio tracks reported."
              : `${audios.length} track(s) reported`}
          </p>
        </div>
      </div>

      {audios.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-[var(--surface-alt)] p-4 text-center text-xs text-muted-foreground">
          No audio tracks reported for this video.
        </div>
      ) : (
        <>
          {audioSupported === false && (
            <Alert className="rounded-2xl border-[var(--accent-amber)]/40 bg-[var(--accent-amber-soft)] text-[var(--accent-amber)] [&>svg]:text-[var(--accent-amber)]">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Browser limitation</AlertTitle>
              <AlertDescription className="text-[var(--accent-amber)]/90">
                HTML5 video does not expose switchable audio tracks for this
                source. Track URLs are listed below for transparency — switching
                is not supported in this simple playground.
              </AlertDescription>
            </Alert>
          )}
          {audioSupported === true && (
            <Alert className="rounded-2xl border-[var(--accent-teal)]/40 bg-[var(--accent-teal-soft)] text-[var(--accent-teal)] [&>svg]:text-[var(--accent-teal)]">
              <Volume2 className="h-4 w-4" />
              <AlertTitle>Native audio switching available</AlertTitle>
              <AlertDescription className="text-[var(--accent-teal)]/90">
                {trackCount} switchable audio track(s) detected by the browser.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            {audios.map((a, i) => {
              const isActive = !!audioSupported && activeIdx === i;
              const clickable = !!audioSupported && i < trackCount;
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border p-3 text-xs",
                    isActive
                      ? "border-[var(--accent-teal)] bg-[var(--accent-teal-soft)]"
                      : "border-border bg-[var(--surface)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{a.lang || `Audio ${i + 1}`}</p>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-[10px] text-muted-foreground hover:text-[var(--accent-indigo)]"
                      >
                        {a.url}
                      </a>
                    </div>
                    {clickable ? (
                      <Button
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        onClick={() => onSwitch(i)}
                        disabled={isActive}
                        className="h-7 rounded-lg text-[11px]"
                      >
                        {isActive ? "Active" : "Switch"}
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">URL only</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}
