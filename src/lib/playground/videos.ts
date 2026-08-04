/**
 * videos.ts — Resolve all playable videos for an episode.
 *
 * Steps:
 *   1. Fetch the video page (ext.videos.url template or the episode URL).
 *   2. For each configured server, locate its embed via the server's CSS
 *      selector and run the server's extractor from the registry.
 *   3. Also run the generic scanner on the page itself (catches direct links).
 *   4. Aggregate videos, dedupe, and collect resolutions/formats/subtitles/audio.
 *
 * Every server's outcome (videos found, notes, unsupported) is surfaced so the
 * UI can show exactly what happened — nothing is silently hidden.
 */
import * as cheerio from "cheerio";
import type { ExtensionJson, VideoServer } from "@/lib/converter/types";
import { fetchPage, resolveUrl, type FetchResult } from "./fetch";
import {
  getExtractor,
  type ExtractedVideo,
  type SubtitleTrack,
  type AudioTrack,
} from "./extractors";

export interface ServerResult {
  server: VideoServer;
  embedUrl: string;
  videos: ExtractedVideo[];
  notes: string[];
  unsupported: boolean;
  error?: string;
}

export interface VideosResult {
  servers: ServerResult[];
  allVideos: ExtractedVideo[];
  resolutions: string[];
  formats: string[];
  subtitleTracks: SubtitleTrack[];
  audioTracks: AudioTrack[];
  fetch: FetchResult;
  warnings: string[];
}

export async function resolveVideos(
  ext: ExtensionJson,
  episodeUrl: string,
  onlyServerName?: string,
): Promise<VideosResult> {
  const warnings: string[] = [];
  const pageUrl =
    ext.videos.url && ext.videos.url !== "{episodeUrl}"
      ? resolveUrl(ext.videos.url, ext.source.baseUrl, { episodeUrl })
      : episodeUrl;

  const fetch = await fetchPage(pageUrl, ext.source, ext.videos.headers);
  if (!fetch.ok || !fetch.html) {
    return {
      servers: [],
      allVideos: [],
      resolutions: [],
      formats: [],
      subtitleTracks: [],
      audioTracks: [],
      fetch,
      warnings: [fetch.error ?? "Failed to fetch video page"],
    };
  }

  const $ = cheerio.load(fetch.html);
  const servers = ext.videos.servers.filter(
    (s) => !onlyServerName || s.name.toLowerCase() === onlyServerName.toLowerCase(),
  );

  const results: ServerResult[] = [];

  // If no servers configured, run the generic scanner on the page directly.
  const serversToProcess =
    servers.length > 0
      ? servers
      : [
          {
            name: "Auto-detect",
            selector: "",
            extractor: "generic",
            qualities: [],
            note: "No servers configured; running generic page scan.",
          },
        ];

  for (const server of serversToProcess) {
    let embedUrl = pageUrl;
    if (server.selector) {
      const $el = $(server.selector).first();
      if ($el.length) {
        embedUrl =
          $el.attr("src") ||
          $el.attr("data-src") ||
          $el.attr("href") ||
          $el.attr("data-video") ||
          pageUrl;
        if (embedUrl && !embedUrl.startsWith("http")) {
          embedUrl = new URL(embedUrl, ext.source.baseUrl).href;
        }
      } else {
        const res: ServerResult = {
          server,
          embedUrl: "",
          videos: [],
          notes: [],
          unsupported: false,
          error: `Selector "${server.selector}" matched no element on the page.`,
        };
        results.push(res);
        continue;
      }
    }

    const extractor = getExtractor(server.extractor);
    try {
      const out = await extractor(embedUrl, ext.source, server.name);
      results.push({
        server,
        embedUrl,
        videos: out.videos,
        notes: out.notes,
        unsupported: out.unsupported,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        server,
        embedUrl,
        videos: [],
        notes: [],
        unsupported: false,
        error: msg,
      });
    }
  }

  // Aggregate + dedupe
  const allVideos: ExtractedVideo[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    for (const v of r.videos) {
      if (seen.has(v.url)) continue;
      seen.add(v.url);
      allVideos.push(v);
    }
  }

  const resolutions = uniq(allVideos.map((v) => v.quality)).sort();
  const formats = uniq(allVideos.map((v) => v.format));
  const subtitleTracks = uniqTracks(
    allVideos.flatMap((v) => v.subtitleTracks),
  );
  const audioTracks = uniqTracks(allVideos.flatMap((v) => v.audioTracks)) as AudioTrack[];

  if (allVideos.length === 0) {
    warnings.push(
      "No playable videos were resolved from any server. See per-server notes for details.",
    );
  }

  return {
    servers: results,
    allVideos,
    resolutions,
    formats,
    subtitleTracks,
    audioTracks,
    fetch,
    warnings,
  };
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function uniqTracks<T extends { url: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of arr) {
    if (seen.has(t.url)) continue;
    seen.add(t.url);
    out.push(t);
  }
  return out;
}
