/**
 * fetch.ts — Playground fetch layer.
 *
 * Delegates all HTTP requests to the browser-fetch service (Playwright-backed)
 * which uses a real Chromium browser to bypass Cloudflare/anti-bot challenges.
 * Cookies persist across restarts, and when a captcha is needed, the service
 * can open a visible browser window for the user to solve it.
 *
 * The browser-fetch service runs on port 3030 as a mini-service.
 */

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  html: string;
  contentType: string;
  error?: string;
  blocked?: boolean;
  needsCaptcha?: boolean;
}

const BROWSER_FETCH_URL = "http://localhost:3030";

/** Resolve a URL template against a base, expanding {baseUrl}/{page}/{query}/... */
export function resolveUrl(
  template: string,
  baseUrl: string,
  vars: Record<string, string | number> = {},
): string {
  let out = template;
  if (baseUrl && /^https?:\/\//.test(baseUrl)) {
    out = out.replaceAll("{baseUrl}", baseUrl.replace(/\/$/, ""));
  }
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, encodeURIComponent(String(v)));
  }
  if (/^https?:\/\//.test(out)) return out;
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
    return out;
  }
  out = baseUrl.replace(/\/$/, "") + (out.startsWith("/") ? out : "/" + out);
  return out;
}

/**
 * Fetch a page through the browser-fetch service (Playwright/Chromium).
 * Falls back to a plain fetch() if the service is not running, with a clear
 * error message explaining how to start it.
 */
export async function fetchPage(
  url: string,
  _source?: unknown,
  _extraHeaders?: Record<string, string>,
  timeoutMs = 60000,
): Promise<FetchResult> {
  if (!url || !/^https?:\/\//.test(url)) {
    return {
      ok: false,
      status: 0,
      url: url || "(empty)",
      html: "",
      contentType: "",
      error: `Invalid URL: "${url}". The extension's base URL or URL template is not configured correctly.`,
    };
  }

  try {
    const res = await fetch(`${BROWSER_FETCH_URL}/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, timeout: timeoutMs }),
      signal: AbortSignal.timeout(timeoutMs + 10000),
    });

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        url,
        html: "",
        contentType: "",
        error: `Browser-fetch service error (HTTP ${res.status}). Make sure the service is running on port 3030.`,
      };
    }

    const data = (await res.json()) as {
      ok: boolean;
      status: number;
      html: string;
      url: string;
      blocked?: boolean;
      needsCaptcha?: boolean;
      error?: string;
    };

    return {
      ok: data.ok,
      status: data.status,
      url: data.url,
      html: data.html,
      contentType: "text/html",
      error: data.error,
      blocked: data.blocked,
      needsCaptcha: data.needsCaptcha,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isConnection = /ECONNREFUSED|fetch failed|connect/i.test(msg);
    return {
      ok: false,
      status: 0,
      url,
      html: "",
      contentType: "",
      error: isConnection
        ? `Cannot reach the browser-fetch service on port 3030. Make sure it is running (it starts automatically with 'bun run dev'). If it's not running, the playground cannot fetch pages. Error: ${msg}`
        : `Fetch error: ${msg}`,
    };
  }
}

/**
 * Request the browser-fetch service to open a visible browser window for
 * the user to solve a captcha/Cloudflare challenge. After solving, cookies
 * are persisted and subsequent requests will work.
 */
export async function solveCaptcha(
  url: string,
): Promise<{ ok: boolean; message: string; cookiesSaved?: number }> {
  try {
    const res = await fetch(`${BROWSER_FETCH_URL}/solve-captcha`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(300000), // 5 min max for captcha solving
    });
    if (!res.ok) {
      return { ok: false, message: `Service error (HTTP ${res.status})` };
    }
    return await res.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Cannot reach browser-fetch service: ${msg}` };
  }
}

/** Check if the browser-fetch service is running. */
export async function checkBrowserFetchService(): Promise<{
  running: boolean;
  headless?: boolean;
  captchaInProgress?: boolean;
}> {
  try {
    const res = await fetch(`${BROWSER_FETCH_URL}/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { running: false };
    const data = await res.json();
    return {
      running: true,
      headless: data.headless,
      captchaInProgress: data.captchaInProgress,
    };
  } catch {
    return { running: false };
  }
}
