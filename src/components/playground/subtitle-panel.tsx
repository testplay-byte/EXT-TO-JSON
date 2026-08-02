"use client";

/**
 * subtitle-panel.tsx — subtitle track picker + live styling controls.
 *
 * The styling is applied to the actual <video> by injecting a <style> tag
 * targeting `video#pg-video::cue`. Vertical position is applied to each
 * VTTCue.line (with snapToLines = false so line is treated as a percentage).
 *
 * A small "preview" line is rendered using the same CSS variables so the
 * user can see the styling live without needing the video to be playing.
 */
import * as React from "react";
import { motion } from "framer-motion";
import { Subtitles, Type, Palette, MoveVertical, Eye } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SubtitlePosition = "top" | "middle" | "bottom";

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  bgOpacity: number; // 0..1
  position: SubtitlePosition;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 20,
  textColor: "#ffffff",
  bgOpacity: 0.5,
  position: "bottom",
};

const FONT_OPTIONS = [
  { label: "Sans (Inter)", value: "Inter, system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono (JetBrains)", value: "'JetBrains Mono', ui-monospace, monospace" },
  { label: "Rounded", value: "'Trebuchet MS', 'Verdana', sans-serif" },
];

const COLOR_OPTIONS = [
  "#ffffff",
  "#fff7d6",
  "#ffe9a8",
  "#fde68a",
  "#a7f3d0",
  "#bfdbfe",
  "#fbcfe8",
  "#000000",
];

export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function SubtitlePanel({
  style,
  onStyleChange,
  tracks,
  activeIdx,
  onActiveChange,
}: {
  style: SubtitleStyle;
  onStyleChange: (next: SubtitleStyle) => void;
  tracks: { url: string; lang: string; format?: string }[];
  activeIdx: number;
  onActiveChange: (idx: number) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-border bg-[var(--surface)] p-4 shadow-[var(--shadow)] space-y-4"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-secondary-soft)] text-[var(--accent-secondary)]">
          <Subtitles className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-sm font-semibold leading-tight">Subtitles</h4>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Pick a track and style it live.
          </p>
        </div>
      </div>

      {/* Track picker */}
      {tracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-[var(--surface-alt)] p-4 text-center text-xs text-muted-foreground">
          No subtitle tracks reported for this video.
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Track</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onActiveChange(-1)}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-medium transition-all min-h-[40px]",
                activeIdx === -1
                  ? "border-[var(--accent-indigo)] bg-[var(--accent-indigo-soft)] text-[var(--accent-indigo)]"
                  : "border-border bg-[var(--surface)] hover:border-[var(--border-strong)]",
              )}
            >
              Off
            </button>
            {tracks.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onActiveChange(i)}
                title={t.url}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-medium transition-all min-h-[40px] truncate",
                  activeIdx === i
                    ? "border-[var(--accent-indigo)] bg-[var(--accent-indigo-soft)] text-[var(--accent-indigo)]"
                    : "border-border bg-[var(--surface)] hover:border-[var(--border-strong)]",
                )}
              >
                <span className="block truncate">
                  {t.lang || `Track ${i + 1}`}
                </span>
                <span className="block text-[10px] text-muted-foreground truncate">
                  {(t.format || (t.url.toLowerCase().endsWith(".srt") ? "srt" : "vtt"))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="rounded-2xl bg-[#0f0f10] p-5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
          <Eye className="h-3 w-3" /> Live preview
        </div>
        <div
          className="relative h-12 w-full"
          style={{
            display: "flex",
            alignItems:
              style.position === "top"
                ? "flex-start"
                : style.position === "middle"
                  ? "center"
                  : "flex-end",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              color: style.textColor,
              backgroundColor: hexToRgba("#000000", style.bgOpacity),
              padding: "0.1em 0.4em",
              borderRadius: "4px",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            The quick brown fox
          </span>
        </div>
      </div>

      {/* Styling controls */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Type className="h-3 w-3" /> Font family
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => onStyleChange({ ...style, fontFamily: f.value })}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11px] font-medium border transition-all min-h-[36px]",
                  style.fontFamily === f.value
                    ? "border-[var(--accent-indigo)] bg-[var(--accent-indigo-soft)] text-[var(--accent-indigo)]"
                    : "border-border bg-[var(--surface)] hover:border-[var(--border-strong)]",
                )}
                style={{ fontFamily: f.value }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground inline-flex items-center justify-between w-full">
            <span>Font size</span>
            <span className="font-mono text-foreground">{style.fontSize}px</span>
          </Label>
          <Slider
            min={12}
            max={48}
            step={1}
            value={[style.fontSize]}
            onValueChange={(v) => onStyleChange({ ...style, fontSize: v[0] ?? style.fontSize })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Palette className="h-3 w-3" /> Text color
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onStyleChange({ ...style, textColor: c })}
                aria-label={`Color ${c}`}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-all",
                  style.textColor === c
                    ? "border-[var(--accent-indigo)] scale-110"
                    : "border-border hover:scale-105",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              className="h-7 w-7 rounded-full border-2 border-dashed border-border cursor-pointer overflow-hidden relative flex items-center justify-center text-[10px] text-muted-foreground"
              title="Custom color"
            >
              +
              <input
                type="color"
                value={style.textColor}
                onChange={(e) =>
                  onStyleChange({ ...style, textColor: e.target.value })
                }
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground inline-flex items-center justify-between w-full">
            <span>Background opacity</span>
            <span className="font-mono text-foreground">
              {Math.round(style.bgOpacity * 100)}%
            </span>
          </Label>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[style.bgOpacity]}
            onValueChange={(v) =>
              onStyleChange({ ...style, bgOpacity: v[0] ?? style.bgOpacity })
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <MoveVertical className="h-3 w-3" /> Vertical position
          </Label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["top", "middle", "bottom"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onStyleChange({ ...style, position: p })}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-[11px] font-medium border transition-all capitalize min-h-[36px]",
                  style.position === p
                    ? "border-[var(--accent-indigo)] bg-[var(--accent-indigo-soft)] text-[var(--accent-indigo)]"
                    : "border-border bg-[var(--surface)] hover:border-[var(--border-strong)]",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
