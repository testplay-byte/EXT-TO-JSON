/**
 * ============================================================================
 *  scripts/dev.mjs — Cross-platform dev server launcher with logging.
 *  ----------------------------------------------------------------------------
 *  Replaces the Unix-only `next dev -p 3000 2>&1 | tee dev.log` pipeline so
 *  that `bun run dev` and `npm run dev` work identically on Windows, macOS,
 *  and Linux.
 *
 *  What it does:
 *    1. Spawns `next dev -p 3000` (found via node_modules/.bin).
 *    2. Streams stdout + stderr to BOTH the console (so you see live output)
 *       AND dev.log (so the app can read its own server log).
 *    3. Forwards Ctrl+C / SIGTERM to the child so the server shuts down cleanly.
 *    4. Exits with the child's exit code.
 * ============================================================================
 */
import { spawn, exec } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PORT = process.env.PORT || "3000";
const LOG_FILE = "dev.log";
const URL = `http://localhost:${PORT}`;

// Resolve the next binary directly from node_modules/.bin so we don't rely on
// the shell PATH (which can be missing when launched detached / on Windows).
const repoRoot = process.cwd();
const isWin = process.platform === "win32";
const nextBin = join(
  repoRoot,
  "node_modules",
  ".bin",
  isWin ? "next.CMD" : "next",
);
const nextCmd = existsSync(nextBin) ? nextBin : "next";

// Truncate the log file at start (fresh log each run).
const log = createWriteStream(LOG_FILE, { flags: "w" });

const startTime = new Date().toISOString();
log.write(`[dev.mjs] Starting next dev on port ${PORT} at ${startTime}\n`);
log.write(`[dev.mjs] next binary: ${nextCmd}\n`);
process.stdout.write(`\n  Starting next dev on port ${PORT}...\n\n`);

// Spawn next. Use shell:true only when falling back to the bare "next" name
// (so the OS resolves it via PATH); when we have an absolute path we spawn
// directly for reliability.
const useShell = nextCmd === "next";
const child = spawn(nextCmd, ["dev", "-p", PORT], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: useShell,
  env: process.env,
  cwd: repoRoot,
});

let browserOpened = false;

/** Open the default browser to the dev URL (cross-platform). */
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
      // Non-fatal — just inform the user.
      process.stdout.write(`\n  (Could not auto-open browser: ${err.message})\n  Open manually: ${URL}\n\n`);
    } else {
      process.stdout.write(`\n  Opening ${URL} in your browser...\n\n`);
    }
  });
}

/** Write a chunk to both the terminal and the log file. */
function tee(data, stream) {
  try {
    stream.write(data);
  } catch {
    /* stream may be closed during shutdown */
  }
  try {
    log.write(data);
  } catch {
    /* ignore log write errors */
  }
  // Detect the "Ready" signal and open the browser once.
  if (!browserOpened) {
    const text = data.toString();
    if (text.includes("Ready in") || text.includes("Local:") || /GET \/ 200/.test(text)) {
      // Small delay so the server is fully accepting connections.
      setTimeout(openBrowser, 600);
    }
  }
}

child.stdout.on("data", (d) => tee(d, process.stdout));
child.stderr.on("data", (d) => tee(d, process.stderr));

child.on("error", (err) => {
  const msg = `[dev.mjs] Failed to start 'next': ${err.message}\n` +
    `Make sure dependencies are installed (run: bun install or npm install).\n`;
  process.stderr.write(msg);
  log.write(msg);
  log.end();
  process.exit(1);
});

child.on("exit", (code, signal) => {
  const msg = `[dev.mjs] next dev exited — code ${code} signal ${signal}\n`;
  process.stdout.write(msg);
  log.write(msg);
  log.end();
  process.exit(code ?? 1);
});

// Clean shutdown: forward signals to the child so Next.js can tear down.
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
