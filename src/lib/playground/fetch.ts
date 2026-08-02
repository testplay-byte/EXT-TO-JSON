/**
 * fetch.ts — Server-side live page fetcher for the playground.
 *
 * Fetches a URL with the extension's configured headers + a full set of
 * browser-like headers (Referer, sec-fetch-*, Accept-Language) so the site
 * treats the request like a real browser visit.
 *
 * Errors are NEVER silently hidden — they surface as structured FetchResult
 * objects with status, url, and a human-readable detail that explains 403/404/
 * Cloudflare challenges in plain language.
 */
import type { SourceConfig } from "@/lib/converter/types";

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  html: string;
  contentType: string;
  error?: string;
  /** True when a Cloudflare/anti-bot challenge page was detected. */
  blocked?: boolean;
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

/** Resolve a URL template against a base, expanding {baseUrl}/{page}/{query}/... */
export function resolveUrl(
  template: string,
  baseUrl: string,
  vars: Record<string, string | number> = {},
): string {
  let out = template;
  // First, substitute {baseUrl} with the actual base URL (stripped trailing slash).
  if (baseUrl && /^https?:\/\//.test(baseUrl)) {
    out = out.replaceAll("{baseUrl}", baseUrl.replace(/\/$/, ""));
  }
  // Then substitute other vars ({page}, {query}, {vrf}, ...).
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

/** Build a full set of browser-like headers for a fetch. */
function buildBrowserHeaders(
  source: SourceConfig,
  targetUrl: string,
  extraHeaders: Record<string, string>,
): Record<string, string> {
  const baseUrl = source.baseUrl;
  // Referer = the site's own base URL (most anime sites require this).
  const referer = baseUrl
    ? baseUrl.replace(/\/$/, "") + "/"
    : new URL(targetUrl).origin + "/";

  return {
    "User-Agent": source.userAgent ?? DEFAULT_UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": referer,
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
    "sec-ch-ua":
      '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    ...source.headers,
    ...extraHeaders,
  };
}

/** Explain an HTTP status code in plain language so the user understands. */
function explainStatus(status: number, url: string): string {
  switch (status) {
    case 403:
      return `HTTP 403 Forbidden — the site blocked the request. This is usually a Cloudflare/anti-bot challenge or geo-blocking. The site may not allow access from your region or IP. Try a different domain in the extension Settings, or use a VPN.`;
    case 404:
      return `HTTP 404 Not Found — the page does not exist at ${url}. The site layout may have changed, or the URL template is wrong. Check the extension's browse/details URL in the JSON.`;
    case 429:
      return `HTTP 429 Too Many Requests — you are being rate-limited. Wait a minute and try again.`;
    case 500:
    case 502:
    case 503:
      return `HTTP ${status} Server Error — the site is temporarily unavailable. Try again later.`;
    case 0:
      return `Network error — could not reach the site. Check your internet connection or whether the site is down.`;
    default:
      return `HTTP ${status}`;
  }
}

/** Detect Cloudflare / anti-bot challenge pages in the response HTML. */
function detectBlock(html: string): boolean {
  return (
    /Just a moment\.\.\.|Cloudflare|cf-browser-verification|cf-challenge/i.test(
      html,
    ) || /Attention Required! \| Cloudflare/i.test(html)
  );
}

export async function fetchPage(
  url: string,
  source: SourceConfig,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 30000,
): Promise<FetchResult> {
  // Guard: don't even try if the URL isn't a real http(s) URL.
  if (!url || !/^https?:\/\//.test(url)) {
    return {
      ok: false,
      status: 0,
      url: url || "(empty)",
      html: "",
      contentType: "",
      error: `Invalid URL: "${url}". The extension's base URL or URL template is not configured correctly. Check the extension details page.`,
    };
  }

  const headers = buildBrowserHeaders(source, url, extraHeaders);

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
    const blocked = detectBlock(html);

    if (blocked) {
      return {
        ok: false,
        status: res.status,
        url: res.url,
        html,
        contentType,
        blocked: true,
        error: `Anti-bot challenge detected (Cloudflare). The site requires solving a CAPTCHA/JS challenge that this playground cannot automate. The site works in a real browser because you solve the challenge manually. Try a different domain in Settings, or access the site in your browser first to establish a session.`,
      };
    }

    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      html,
      contentType,
      error: res.ok ? undefined : explainStatus(res.status, res.url),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = /abort|timeout/i.test(msg);
    return {
      ok: false,
      status: 0,
      url,
      html: "",
      contentType: "",
      error: isTimeout
        ? `Request timed out after ${timeoutMs / 1000}s — the site is slow or not responding.`
        : `Network error: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
