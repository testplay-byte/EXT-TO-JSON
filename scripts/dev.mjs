/**
 * ============================================================================
 *  scripts/dev.mjs — Cross-platform dev launcher with logging.
 *  ----------------------------------------------------------------------------
 *  Starts TWO services:
 *    1. The browser-fetch service (port 3030) — Playwright-backed fetcher
 *       with cookie persistence + captcha solving.
 *    2. The Next.js dev server (port 3000) — the main web app.
 *
 *  Both services' output is teed to the console AND dev.log. The browser
 *  auto-opens when the Next.js server is ready. Ctrl+C stops both.
 * ============================================================================
 */
import { spawn, exec } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = process.env.PORT || "3000";
const LOG_FILE = "dev.log";
const URL = `http://localhost:${PORT}`;

const repoRoot = process.cwd();
const isWin = process.platform === "win32";

// Truncate the log file at start (fresh log each run).
const log = createWriteStream(LOG_FILE, { flags: "w" });

const startTime = new Date().toISOString();
log.write(`[dev.mjs] Starting dev servers at ${startTime}\n`);
process.stdout.write(`\n  Starting dev servers...\n\n`);

/** Write a chunk to both the terminal and the log file with a prefix. */
function tee(data, stream, prefix) {
  const text = data.toString();
  for (const line of text.split("\n")) {
    if (line.trim()) {
      const prefixed = `[${prefix}] ${line}\n`;
      try { stream.write(prefixed); } catch { /* */ }
      try { log.write(prefixed); } catch { /* */ }
    } else {
      try { stream.write("\n"); } catch { /* */ }
    }
  }
}

// ---------------------------------------------------------------------------
//  1. Start the browser-fetch service (port 3030)
// ---------------------------------------------------------------------------
const bfDir = join(repoRoot, "mini-services", "browser-fetch");
const bfChild = spawn("bun", ["run", "index.ts"], {
  stdio: ["ignore", "pipe", "pipe"],
  cwd: bfDir,
  env: process.env,
});

bfChild.stdout.on("data", (d) => tee(d, process.stdout, "browser-fetch"));
bfChild.stderr.on("data", (d) => tee(d, process.stderr, "browser-fetch"));
bfChild.on("error", (err) => {
  process.stderr.write(`[dev.mjs] browser-fetch failed to start: ${err.message}\n`);
});
bfChild.on("exit", (code) => {
  process.stdout.write(`[dev.mjs] browser-fetch exited (code ${code})\n`);
});

// ---------------------------------------------------------------------------
//  2. Start the Next.js dev server (port 3000)
// ---------------------------------------------------------------------------
const nextBin = join(repoRoot, "node_modules", ".bin", isWin ? "next.CMD" : "next");
const nextCmd = existsSync(nextBin) ? nextBin : "next";
const useShell = nextCmd === "next";

const nextChild = spawn(nextCmd, ["dev", "-p", PORT], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: useShell,
  env: process.env,
  cwd: repoRoot,
});

let browserOpened = false;

function openBrowser() {
  if (browserOpened) return;
  browserOpened = true;
  const cmd =
    process.platform === "win32"
      ? `start "" "${URL}"`
      : process.platform === "darwin"
        ? `open "${URL}"`
        : `xdg-open "${URL}"`;
  exec(cmd, (err) => {
    if (err) {
      process.stdout.write(`\n  (Could not auto-open browser: ${err.message})\n  Open manually: ${URL}\n\n`);
    } else {
      process.stdout.write(`\n  Opening ${URL} in your browser...\n\n`);
    }
  });
}

nextChild.stdout.on("data", (d) => {
  try { process.stdout.write(d); } catch { /* */ }
  try { log.write(d); } catch { /* */ }
  if (!browserOpened) {
    const text = d.toString();
    if (text.includes("Ready in") || text.includes("Local:") || /GET \/ 200/.test(text)) {
      setTimeout(openBrowser, 600);
    }
  }
});
nextChild.stderr.on("data", (d) => {
  try { process.stderr.write(d); } catch { /* */ }
  try { log.write(d); } catch { /* */ }
});

nextChild.on("error", (err) => {
  const msg = `[dev.mjs] Failed to start 'next': ${err.message}\n` +
    `Make sure dependencies are installed (run: bun install or npm install).\n`;
  process.stderr.write(msg);
  log.write(msg);
  log.end();
  process.exit(1);
});

nextChild.on("exit", (code, signal) => {
  const msg = `[dev.mjs] next dev exited — code ${code} signal ${signal}\n`;
  process.stdout.write(msg);
  log.write(msg);
  // Also kill the browser-fetch service.
  try { bfChild.kill("SIGTERM"); } catch { /* */ }
  log.end();
  process.exit(code ?? 1);
});

// Clean shutdown: forward signals to both children.
function shutdown() {
  try { nextChild.kill("SIGINT"); } catch { /* */ }
  try { bfChild.kill("SIGTERM"); } catch { /* */ }
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
