/**
 * ============================================================================
 *  extractors/index.ts — Video server extractor registry for the playground.
 * ============================================================================
 *
 *  Each extractor takes the embed/page URL + source config + a fetcher, and
 *  returns a list of ExtractedVideo (url, quality, format, subtitles, audio).
 *
 *  Design:
 *   - "direct": the URL is itself a playable video file (mp4/m3u8).
 *   - "generic": fetch the page, scan for iframes + m3u8/mp4 source patterns.
 *   - Named extractors (vidstream, mp4upload, ...): best-effort scan. Real
 *     anti-bot/API-keyed extractors are documented as "unsupported" with a
 *     clear note rather than silently returning nothing.
 *
 *  EVERY outcome (including unsupported) produces an explicit note so the UI
 *  can show the user exactly what happened.
 * ============================================================================
 */
import type { SourceConfig } from "@/lib/converter/types";
import { fetchPage } from "../fetch";

export interface SubtitleTrack {
  url: string;
  lang: string;
  format?: string;
}

export interface AudioTrack {
  url: string;
  lang: string;
}

export interface ExtractedVideo {
  url: string;
  quality: string;
  format: "mp4" | "m3u8" | "mkv" | "unknown";
  serverName: string;
  subtitleTracks: SubtitleTrack[];
  audioTracks: AudioTrack[];
  headers?: Record<string, string>;
  note?: string;
}

export interface ExtractorResult {
  videos: ExtractedVideo[];
  notes: string[];
  unsupported: boolean;
}

export type ExtractorFn = (
  embedUrl: string,
  source: SourceConfig,
  serverName: string,
) => Promise<ExtractorResult>;

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* -------------------------------------------------------------------------- */
/*  Direct extractor                                                          */
/* -------------------------------------------------------------------------- */

const directExtractor: ExtractorFn = async (embedUrl, _source, serverName) => {
  const fmt = detectFormat(embedUrl);
  if (fmt !== "unknown") {
    return {
      videos: [
        {
          url: embedUrl,
          quality: guessQuality(embedUrl) ?? "default",
          format: fmt,
          serverName,
          subtitleTracks: [],
          audioTracks: [],
          note: "Direct video URL.",
        },
      ],
      notes: ["Direct video file detected."],
      unsupported: false,
    };
  }
  // Not direct — fall through to generic scan.
  return genericExtractor(embedUrl, _source, serverName);
};

/* -------------------------------------------------------------------------- */
/*  Generic extractor — scan page for m3u8/mp4 + iframes                      */
/* -------------------------------------------------------------------------- */

export const genericExtractor: ExtractorFn = async (
  embedUrl,
  source,
  serverName,
) => {
  const notes: string[] = [];
  const fetch = await fetchPage(embedUrl, source);
  if (!fetch.ok || !fetch.html) {
    return {
      videos: [],
      notes: [fetch.error ?? `Failed to fetch ${embedUrl}`],
      unsupported: false,
    };
  }

  const videos: ExtractedVideo[] = [];
  const html = fetch.html;

  // 1. Scan for m3u8 manifests (most common for streaming)
  const m3u8Urls = uniq(
    [
      ...html.matchAll(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g),
    ].map((m) => m[0]),
  );
  for (const u of m3u8Urls) {
    videos.push({
      url: u,
      quality: guessQuality(u) ?? "auto (HLS)",
      format: "m3u8",
      serverName,
      subtitleTracks: extractSubtitleTracks(html, source.baseUrl),
      audioTracks: extractAudioTracks(html),
      note: "HLS manifest found in page source.",
    });
  }

  // 2. Scan for mp4 files
  const mp4Urls = uniq(
    [...html.matchAll(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g)].map((m) => m[0]),
  );
  for (const u of mp4Urls) {
    if (videos.some((v) => v.url === u)) continue;
    videos.push({
      url: u,
      quality: guessQuality(u) ?? "default",
      format: "mp4",
      serverName,
      subtitleTracks: [],
      audioTracks: [],
      note: "MP4 source found in page source.",
    });
  }

  // 3. Look for "file":"..." / sources:[{file:"..."}] patterns (common JS)
  const fileRe = /["']?file["']?\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = fileRe.exec(html)) !== null) {
    const u = m[1];
    if (videos.some((v) => v.url === u)) continue;
    const fmt = detectFormat(u);
    if (fmt !== "unknown") {
      videos.push({
        url: u,
        quality: guessQuality(u) ?? "default",
        format: fmt,
        serverName,
        subtitleTracks: [],
        audioTracks: [],
        note: 'Found via "file":"..." pattern.',
      });
    }
  }

  // 4. Iframes — recurse one level (limited)
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/g;
  const iframes: string[] = [];
  while ((m = iframeRe.exec(html)) !== null) {
    iframes.push(m[1]);
  }
  if (iframes.length && videos.length === 0) {
    notes.push(
      `Found ${iframes.length} iframe(s); attempting one-level recursion...`,
    );
    for (const iframe of iframes.slice(0, 3)) {
      const abs = resolveIframe(iframe, embedUrl);
      const sub = await genericExtractor(abs, source, serverName);
      videos.push(...sub.videos);
      notes.push(...sub.notes);
    }
  }

  if (videos.length === 0) {
    notes.push(
      `No playable video URLs found on ${embedUrl}. The server may use an anti-bot/API-keyed extractor not implemented in this registry.`,
    );
  }

  return { videos, notes, unsupported: false };
};

/* -------------------------------------------------------------------------- */
/*  Named extractors (best-effort)                                            */
/* -------------------------------------------------------------------------- */

const namedExtractor = (name: string): ExtractorFn => async (
  embedUrl,
  source,
  serverName,
) => {
  // Reuse the generic scanner, but tag the result with the server name and
  // add an honest note about limitations.
  const result = await genericExtractor(embedUrl, source, serverName);
  result.notes.unshift(
    `Named extractor "${name}" applied (best-effort source scan). ` +
      `If no videos are found, the real Aniyomi extractor for "${name}" may require API keys / anti-bot solving that this playground does not implement.`,
  );
  return result;
};

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

const REGISTRY: Record<string, ExtractorFn> = {
  direct: directExtractor,
  generic: genericExtractor,
  // Named extractors delegate to the generic scanner with a labelled note.
  vidstream: namedExtractor("vidstream"),
  gogo: namedExtractor("gogo"),
  mp4upload: namedExtractor("mp4upload"),
  doodstream: namedExtractor("doodstream"),
  streamtape: namedExtractor("streamtape"),
  filemoon: namedExtractor("filemoon"),
  kwik: namedExtractor("kwik"),
  mixdrop: namedExtractor("mixdrop"),
  streamlare: namedExtractor("streamlare"),
  streamwish: namedExtractor("streamwish"),
  fembed: namedExtractor("fembed"),
  sendvid: namedExtractor("sendvid"),
  streamsb: namedExtractor("streamsb"),
  voe: namedExtractor("voe"),
  yourupload: namedExtractor("yourupload"),
  zoro: namedExtractor("zoro"),
  aniwatch: namedExtractor("aniwatch"),
  kaido: namedExtractor("kaido"),
  miruro: namedExtractor("miruro"),
};

export function getExtractor(id: string): ExtractorFn {
  return REGISTRY[id] ?? unsupportedExtractor;
}

const unsupportedExtractor: ExtractorFn = async (_url, _source, serverName) => ({
  videos: [],
  notes: [
    `No extractor registered for server "${serverName}". ` +
      `This server's videos cannot be resolved by the playground. ` +
      `Add an extractor in src/lib/playground/extractors/index.ts to support it.`,
  ],
  unsupported: true,
});

export function listExtractors(): string[] {
  return Object.keys(REGISTRY);
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function detectFormat(url: string): ExtractedVideo["format"] {
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".m3u8") || u.includes(".m3u8")) return "m3u8";
  if (u.endsWith(".mp4")) return "mp4";
  if (u.endsWith(".mkv")) return "mkv";
  return "unknown";
}

function guessQuality(url: string): string | undefined {
  const m = /(1080|720|480|360|240|4k|2160)/i.exec(url);
  if (m) {
    const q = m[1].toLowerCase();
    return q === "4k" || q === "2160" ? "4K" : `${q}p`;
  }
  return undefined;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function resolveIframe(src: string, base: string): string {
  if (/^https?:\/\//.test(src)) return src;
  if (src.startsWith("//")) return "https:" + src;
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function extractSubtitleTracks(
  html: string,
  baseUrl: string,
): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
  // <track src="..." srclang="..." label="..." kind="subtitles">
  const re =
    /<track[^>]+src=["']([^"']+)["'][^>]*(?:srclang=["']([^"']*)["'])?[^>]*(?:label=["']([^"']*)["'])?[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    tracks.push({
      url: resolveIframe(m[1], baseUrl),
      lang: m[3] || m[2] || "und",
      format: detectSubtitleFormat(m[1]),
    });
  }
  return tracks;
}

function extractAudioTracks(html: string): AudioTrack[] {
  const tracks: AudioTrack[] = [];
  // Look for audio source patterns (best-effort)
  const re = /["']?audio[^"']*["']?\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    tracks.push({ url: m[1], lang: "audio" });
  }
  return tracks;
}

function detectSubtitleFormat(url: string): string {
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".vtt")) return "vtt";
  if (u.endsWith(".srt")) return "srt";
  if (u.endsWith(".ass")) return "ass";
  return "unknown";
}
