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
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

const PORT = process.env.PORT || "3000";
const LOG_FILE = "dev.log";

// Truncate the log file at start (fresh log each run).
const log = createWriteStream(LOG_FILE, { flags: "w" });

const startTime = new Date().toISOString();
log.write(`[dev.mjs] Starting next dev on port ${PORT} at ${startTime}\n`);
process.stdout.write(`\n  Starting next dev on port ${PORT}...\n\n`);

// Spawn next via the shell so node_modules/.bin/next is found on every OS.
const child = spawn("next", ["dev", "-p", PORT], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  env: process.env,
});

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
