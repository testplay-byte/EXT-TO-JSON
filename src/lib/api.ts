/**
 * api.ts — Typed client for the EXT-TO-JSON backend.
 *
 * All playground/converter screens call through here so the API contract is
 * in one place. Every call surfaces backend errors (never silent).
 */
import type {
  ConversionJob,
  ExtensionJson,
  Capabilities,
} from "./converter/types";

const base = "";

async function jfetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base + input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : typeof data === "string"
          ? data
          : `HTTP ${res.status}`) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

/* ----------------------------- Toolchain ------------------------------ */
export interface ToolchainInfo {
  ready: boolean;
  tools: {
    java: { present: boolean; version: string };
    apktool: { present: boolean; version: string };
    jadx: { present: boolean; version: string };
  };
  error?: string;
  paths: { apktoolJar: string; jadxBin: string };
}
export const getToolchain = () => jfetch<ToolchainInfo>("/api/toolchain");

/* ----------------------------- Convert -------------------------------- */
export interface ConvertResponse {
  jobId: string;
  status: string;
}
export async function convertApk(file: File): Promise<ConvertResponse> {
  const form = new FormData();
  form.append("apk", file);
  const res = await fetch("/api/convert", { method: "POST", body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as ConvertResponse;
}
export async function importJson(file: File): Promise<{ extensionId: string; imported: boolean }> {
  const form = new FormData();
  form.append("json", file);
  const res = await fetch("/api/convert?importJson=1", { method: "POST", body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ------------------------------- Jobs --------------------------------- */
export const listJobs = () => jfetch<{ jobs: ConversionJob[] }>("/api/jobs");
export const getJob = (id: string) =>
  jfetch<{ job: ConversionJob }>(`/api/jobs/${id}`);

/* --------------------------- Extensions ------------------------------- */
export interface ExtensionSummary {
  id: string;
  name: string;
  lang: string;
  baseUrl: string;
  packageName: string;
  sourceType: string;
  isNsfw: boolean;
  apkFileName: string;
  apkVersionName: string;
  healthScore: number;
  healthStatus: "healthy" | "warning" | "error";
  healthSummary: string;
  capabilities: Capabilities | null;
  createdAt: string;
  updatedAt: string;
}
export const listExtensions = () =>
  jfetch<{ extensions: ExtensionSummary[] }>("/api/extensions");
export const getExtension = (id: string) =>
  jfetch<ExtensionJson>(`/api/extensions/${id}`);
export async function deleteExtension(id: string): Promise<void> {
  await jfetch<{ ok: boolean }>(`/api/extensions/${id}`, { method: "DELETE" });
}

/* ------------------------- Extension settings -------------------------- */
export type PrefValue = string | boolean | string[];
export const getSettings = (id: string) =>
  jfetch<{ values: Record<string, PrefValue> }>(`/api/extensions/${id}/settings`);
export const saveSettings = (id: string, values: Record<string, PrefValue>) =>
  jfetch<{ ok: boolean; values: Record<string, PrefValue> }>(
    `/api/extensions/${id}/settings`,
    { method: "PUT", body: JSON.stringify({ values }) },
  );

/* ---------------------------- Playground ------------------------------ */
export interface BrowseItem {
  title: string;
  url: string;
  thumbnail: string;
  extras: Record<string, string>;
}
export interface BrowseResult {
  items: BrowseItem[];
  page: number;
  hasNextPage: boolean;
  nextPageUrl?: string;
  fetch: { ok: boolean; status: number; url: string; error?: string };
  warnings: string[];
}
export const pgBrowse = (extensionId: string, type: "popular" | "latest", page = 1) =>
  jfetch<BrowseResult>("/api/playground/browse", {
    method: "POST",
    body: JSON.stringify({ extensionId, type, page }),
  });
export const pgSearch = (
  extensionId: string,
  query: string,
  page = 1,
  filters?: Record<string, string>,
) =>
  jfetch<BrowseResult>("/api/playground/search", {
    method: "POST",
    body: JSON.stringify({ extensionId, query, page, filters }),
  });

export interface DetailsResult {
  details: {
    title: string;
    description: string;
    thumbnail: string;
    author: string;
    artist: string;
    genre: string;
    status: string;
    extras: Record<string, string>;
  };
  fetch: { ok: boolean; status: number; url: string; error?: string };
  warnings: string[];
}
export const pgDetails = (extensionId: string, url: string) =>
  jfetch<DetailsResult>("/api/playground/details", {
    method: "POST",
    body: JSON.stringify({ extensionId, url }),
  });

export interface EpisodeItem {
  number: number;
  name: string;
  url: string;
  scanlator: string;
  date: string;
}
export interface EpisodesResult {
  episodes: EpisodeItem[];
  fetch: { ok: boolean; status: number; url: string; error?: string };
  warnings: string[];
}
export const pgEpisodes = (extensionId: string, url: string) =>
  jfetch<EpisodesResult>("/api/playground/episodes", {
    method: "POST",
    body: JSON.stringify({ extensionId, url }),
  });

export interface ExtractedVideo {
  url: string;
  quality: string;
  format: "mp4" | "m3u8" | "mkv" | "unknown";
  serverName: string;
  subtitleTracks: { url: string; lang: string; format?: string }[];
  audioTracks: { url: string; lang: string }[];
  headers?: Record<string, string>;
  note?: string;
}
export interface VideosResult {
  servers: {
    server: { name: string; selector: string; extractor: string; qualities: string[]; note: string };
    embedUrl: string;
    videos: ExtractedVideo[];
    notes: string[];
    unsupported: boolean;
    error?: string;
  }[];
  allVideos: ExtractedVideo[];
  resolutions: string[];
  formats: string[];
  subtitleTracks: { url: string; lang: string; format?: string }[];
  audioTracks: { url: string; lang: string }[];
  fetch: { ok: boolean; status: number; url: string; error?: string };
  warnings: string[];
}
export const pgVideos = (extensionId: string, url: string, serverName?: string) =>
  jfetch<VideosResult>("/api/playground/videos", {
    method: "POST",
    body: JSON.stringify({ extensionId, url, serverName }),
  });
