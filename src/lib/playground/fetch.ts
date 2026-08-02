/**
 * fetch.ts — Server-side live page fetcher for the playground.
 *
 * Fetches a URL with the extension's configured headers and returns the HTML.
 * Errors are NEVER silently hidden — they surface as structured FetchError
 * objects with status, url, and a human-readable detail.
 */
import type { SourceConfig } from "@/lib/converter/types";

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  html: string;
  contentType: string;
  error?: string;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Resolve a URL template against a base, expanding {page}/{query}/... */
export function resolveUrl(
  template: string,
  baseUrl: string,
  vars: Record<string, string | number> = {},
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, encodeURIComponent(String(v)));
  }
  // If the template is already a full URL, use it as-is.
  if (/^https?:\/\//.test(out)) return out;
  // Otherwise join with baseUrl. Guard against placeholder/empty baseUrl.
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
    // Return the template unchanged so the caller can detect the bad URL via
    // the subsequent fetch failure (which surfaces a clear error message).
    return out;
  }
  out = baseUrl.replace(/\/$/, "") + (out.startsWith("/") ? out : "/" + out);
  return out;
}

export async function fetchPage(
  url: string,
  source: SourceConfig,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 30000,
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    "User-Agent": source.userAgent ?? DEFAULT_UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...source.headers,
    ...extraHeaders,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const html = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      html,
      contentType,
      error: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      url,
      html: "",
      contentType: "",
      error: `Fetch failed: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
