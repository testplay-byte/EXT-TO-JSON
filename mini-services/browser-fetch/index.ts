/**
 * ============================================================================
 *  browser-fetch service — Playwright-backed HTTP fetcher with cookie
 *  persistence and captcha solving.
 *  ----------------------------------------------------------------------------
 *
 *  WHY THIS EXISTS:
 *    Anime streaming sites use Cloudflare/anti-bot protection that blocks
 *    server-side HTTP requests (fetch/curl). A real browser engine (Chromium)
 *    can solve these challenges naturally. This service:
 *
 *      1. Fetches pages through a REAL Chromium browser (headless).
 *      2. Persists cookies to disk (survives restarts).
 *      3. When a Cloudflare challenge is detected, opens a VISIBLE browser
 *         window so the user can solve the captcha. After solving, cookies
 *         are saved and subsequent headless requests work without challenge.
 *
 *  ARCHITECTURE:
 *    - A single persistent browser context (Playwright launchPersistentContext)
 *      is used for the lifetime of the service. Cookies, localStorage, and
 *      session data are saved to ./browser-profile/ automatically.
 *    - Normal fetches: create a page (headless), navigate, get HTML, close.
 *    - Captcha solving: close headless context → relaunch headed (same profile)
 *      → user solves → close headed → relaunch headless. Cookies persist.
 *
 *  PORT: 3030
 *  ENTRY: index.ts
 * ============================================================================
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const PORT = 3030;
// Resolve the profile directory using fileURLToPath (NOT .pathname) because
// on Windows, URL.pathname returns "/C:/Users/..." with a leading slash that
// causes EPERM errors when Playwright tries to mkdir it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROFILE_DIR = join(__dirname, "browser-profile");

// Ensure the profile directory exists before Playwright tries to use it.
try {
  mkdirSync(PROFILE_DIR, { recursive: true });
} catch {
  /* may already exist */
}

/** The persistent browser context. Recreated when switching headless/headed. */
let context: BrowserContext | null = null;
let contextHeadless = true;

/** Mutex: only one captcha-solving session at a time. */
let captchaInProgress = false;

/** Tracks ongoing fetches so we don't close the context mid-fetch. */
let activeFetchCount = 0;

// ---------------------------------------------------------------------------
//  Browser context management
// ---------------------------------------------------------------------------

async function launchContext(headless: boolean): Promise<BrowserContext> {
  let ctx: BrowserContext;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless,
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/New_York",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // avoids /dev/shm issues on low-memory systems
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Provide a helpful error message for common failures.
    if (/EPERM|EACCES|permission/i.test(msg)) {
      throw new Error(
        `Cannot create browser profile at ${PROFILE_DIR}. ` +
        `Permission denied. Make sure the folder is writable and no antivirus ` +
        `is blocking it. Original error: ${msg}`,
      );
    }
    if (/Executable doesn't exist|browserType/i.test(msg)) {
      throw new Error(
        `Playwright Chromium is not installed. Run: ` +
        `cd mini-services/browser-fetch && bunx playwright install chromium. ` +
        `Original error: ${msg}`,
      );
    }
    throw e;
  }
  contextHeadless = headless;
  return ctx;
}

async function ensureContext(): Promise<BrowserContext> {
  if (!context) {
    context = await launchContext(true);
    console.log("[browser-fetch] Headless context launched (profile:", PROFILE_DIR, ")");
  }
  return context;
}

async function switchToHeaded(): Promise<BrowserContext> {
  if (context && !contextHeadless) return context;
  if (context) {
    await context.close();
    context = null;
  }
  context = await launchContext(false);
  console.log("[browser-fetch] Switched to HEADED context for captcha solving.");
  return context;
}

async function switchToHeadless(): Promise<BrowserContext> {
  if (context && contextHeadless) return context;
  if (context) {
    await context.close();
    context = null;
  }
  context = await launchContext(true);
  console.log("[browser-fetch] Switched back to headless context.");
  return context;
}

// ---------------------------------------------------------------------------
//  Cloudflare / challenge detection
// ---------------------------------------------------------------------------

interface ChallengeDetection {
  isChallenge: boolean;
  reason?: string;
}

async function detectChallenge(page: Page): Promise<ChallengeDetection> {
  try {
    const title = await page.title();
    if (/just a moment|attention required|please wait/i.test(title)) {
      return { isChallenge: true, reason: `Page title: "${title}"` };
    }
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) ?? "");
    if (/just a moment\.\.\.|cf-browser-verification|cf-challenge|Cloudflare|attention required/i.test(bodyText)) {
      return { isChallenge: true, reason: "Cloudflare challenge page detected" };
    }
    // Check for very short bodies (often a sign of a blocked/empty response)
    const html = await page.content();
    if (html.length < 500 && /challenge|blocked|captcha/i.test(html)) {
      return { isChallenge: true, reason: "Short blocked response" };
    }
    return { isChallenge: false };
  } catch {
    return { isChallenge: false };
  }
}

// ---------------------------------------------------------------------------
//  Fetch endpoint
// ---------------------------------------------------------------------------

interface FetchRequest {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
  /** If true, wait for this CSS selector to appear before returning. */
  waitForSelector?: string;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  html: string;
  url: string;
  blocked?: boolean;
  needsCaptcha?: boolean;
  error?: string;
}

async function handleFetch(req: FetchRequest): Promise<FetchResponse> {
  if (!req.url || !/^https?:\/\//.test(req.url)) {
    return {
      ok: false,
      status: 0,
      html: "",
      url: req.url || "(empty)",
      error: `Invalid URL: "${req.url}".`,
    };
  }

  activeFetchCount++;
  let page: Page | null = null;
  try {
    const ctx = await ensureContext();
    page = await ctx.newPage();

    // Set extra headers if provided.
    if (req.headers) {
      await page.setExtraHTTPHeaders(req.headers);
    }

    const timeout = req.timeout ?? 30000;
    const response = await page.goto(req.url, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    if (!response) {
      return {
        ok: false,
        status: 0,
        html: "",
        url: req.url,
        error: "No response from the browser.",
      };
    }

    const status = response.status();

    // Wait a moment for Cloudflare challenges to appear (they load via JS).
    await page.waitForTimeout(2000);

    // If a specific selector was requested, wait for it.
    if (req.waitForSelector) {
      try {
        await page.waitForSelector(req.waitForSelector, { timeout: 10000 });
      } catch {
        // Selector not found — continue anyway.
      }
    }

    // Check for Cloudflare/anti-bot challenge.
    const challenge = await detectChallenge(page);
    if (challenge.isChallenge) {
      const html = await page.content();
      return {
        ok: false,
        status,
        html,
        url: page.url(),
        blocked: true,
        needsCaptcha: true,
        error: `Anti-bot challenge detected (${challenge.reason}). Click "Solve Now" to open a browser window and solve the captcha. Cookies will be saved for future requests.`,
      };
    }

    const html = await page.content();
    return {
      ok: status >= 200 && status < 400,
      status,
      html,
      url: page.url(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = /timeout|abort/i.test(msg);
    return {
      ok: false,
      status: 0,
      url: req.url,
      html: "",
      error: isTimeout
        ? `Browser request timed out. The site may be slow or not responding.`
        : `Browser error: ${msg}`,
    };
  } finally {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
    activeFetchCount--;
  }
}

// ---------------------------------------------------------------------------
//  Captcha solving endpoint
// ---------------------------------------------------------------------------

interface SolveRequest {
  url: string;
}

interface SolveResponse {
  ok: boolean;
  message: string;
  cookiesSaved?: number;
}

async function handleSolveCaptcha(req: SolveRequest): Promise<SolveResponse> {
  if (captchaInProgress) {
    return {
      ok: false,
      message: "A captcha-solving session is already in progress. Please complete it first.",
    };
  }
  if (!req.url || !/^https?:\/\//.test(req.url)) {
    return { ok: false, message: `Invalid URL: "${req.url}".` };
  }

  captchaInProgress = true;
  let page: Page | null = null;
  try {
    // Switch to headed mode so the user can see and interact with the browser.
    const ctx = await switchToHeaded();
    page = await ctx.newPage();

    console.log(`[browser-fetch] Opening headed browser for: ${req.url}`);
    await page.goto(req.url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for the user to solve the challenge.
    // Detection: the page title changes from "Just a moment..." to something else,
    // OR the URL changes (redirect after solving), OR a real content selector appears.
    const origin = new URL(req.url).origin;
    let solved = false;
    let attempts = 0;
    const maxAttempts = 120; // 120 × 2s = 4 minutes max

    while (attempts < maxAttempts && !solved) {
      await page.waitForTimeout(2000);
      attempts++;
      try {
        const title = await page.title();
        const currentUrl = page.url();

        // Check if challenge is gone.
        if (!/just a moment|attention required|please wait/i.test(title)) {
          // Also verify the page has real content (not a blank post-challenge page).
          const bodyLen = await page.evaluate(() => document.body?.innerText?.length ?? 0);
          if (bodyLen > 200) {
            solved = true;
            console.log(`[browser-fetch] Captcha solved after ${attempts * 2}s. Title: "${title}"`);
            break;
          }
        }
      } catch {
        // Page might be navigating; continue waiting.
      }
    }

    if (!solved) {
      return {
        ok: false,
        message: "Captcha was not solved within 4 minutes. Please try again.",
      };
    }

    // Give cookies a moment to settle, then count them.
    await page.waitForTimeout(1000);
    const cookies = await ctx.cookies(origin);
    console.log(`[browser-fetch] ${cookies.length} cookies saved for ${origin}`);

    // Switch back to headless for normal operations.
    await switchToHeadless();

    return {
      ok: true,
      message: `Captcha solved successfully. ${cookies.length} cookies saved for ${origin}.`,
      cookiesSaved: cookies.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[browser-fetch] Captcha solving error:", msg);
    // Try to switch back to headless even on error.
    try { await switchToHeadless(); } catch { /* ignore */ }
    return { ok: false, message: `Error during captcha solving: ${msg}` };
  } finally {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
    captchaInProgress = false;
  }
}

// ---------------------------------------------------------------------------
//  Status + cookie endpoints
// ---------------------------------------------------------------------------

async function handleStatus() {
  return {
    ready: true,
    hasContext: context !== null,
    headless: contextHeadless,
    captchaInProgress,
    activeFetchCount,
    profileDir: PROFILE_DIR,
  };
}

async function handleCookieStatus(url: string) {
  try {
    const ctx = await ensureContext();
    const origin = new URL(url).origin;
    const cookies = await ctx.cookies(origin);
    return {
      hasCookies: cookies.length > 0,
      cookieCount: cookies.length,
      domain: new URL(url).hostname,
      cookieNames: cookies.map((c) => c.name),
    };
  } catch (e) {
    return {
      hasCookies: false,
      cookieCount: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
//  HTTP server (Bun.serve)
// ---------------------------------------------------------------------------

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS — allow the Next.js app to call this service.
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      if (path === "/status" && method === "GET") {
        return jsonRes(await handleStatus());
      }

      if (path === "/fetch" && method === "POST") {
        const body = await readBody(req);
        const result = await handleFetch(body);
        return jsonRes(result);
      }

      if (path === "/solve-captcha" && method === "POST") {
        const body = await readBody(req);
        const result = await handleSolveCaptcha(body);
        return jsonRes(result);
      }

      if (path === "/cookie-status" && method === "GET") {
        const targetUrl = url.searchParams.get("url") ?? "";
        return jsonRes(await handleCookieStatus(targetUrl));
      }

      return jsonRes({ error: "Not found" }, 404);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[browser-fetch] Unhandled error:", msg);
      return jsonRes({ error: msg }, 500);
    }
  },
});

console.log(`[browser-fetch] Service running on http://localhost:${PORT}`);
console.log(`[browser-fetch] Profile directory: ${PROFILE_DIR}`);

// Graceful shutdown — close the browser context.
process.on("SIGINT", async () => {
  console.log("[browser-fetch] Shutting down...");
  if (context) {
    try { await context.close(); } catch { /* ignore */ }
  }
  server.stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  if (context) {
    try { await context.close(); } catch { /* ignore */ }
  }
  server.stop();
  process.exit(0);
});
