/**
 * scripts/start.mjs — Cross-platform production server launcher with logging.
 * Replaces the Unix-only `NODE_ENV=production bun .next/standalone/server.js | tee server.log`.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";

const LOG_FILE = "server.log";
const SERVER = ".next/standalone/server.js";

if (!existsSync(SERVER)) {
  process.stderr.write(
    `[start.mjs] Production build not found at ${SERVER}.\n` +
    `Run "bun run build" first.\n`,
  );
  process.exit(1);
}

const log = createWriteStream(LOG_FILE, { flags: "w" });
log.write(`[start.mjs] Starting production server at ${new Date().toISOString()}\n`);

const env = { ...process.env, NODE_ENV: "production" };

// Use bun if available, otherwise node.
const cmd = process.env.BUN_PATH || (await hasBun() ? "bun" : "node");
const child = spawn(cmd, [SERVER], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  env,
});

function tee(data, stream) {
  try { stream.write(data); } catch { /* */ }
  try { log.write(data); } catch { /* */ }
}

child.stdout.on("data", (d) => tee(d, process.stdout));
child.stderr.on("data", (d) => tee(d, process.stderr));
child.on("error", (err) => {
  process.stderr.write(`[start.mjs] Error: ${err.message}\n`);
  log.write(`[start.mjs] ERROR: ${err.message}\n`);
  log.end();
  process.exit(1);
});
child.on("exit", (code) => {
  log.write(`[start.mjs] Server exited with code ${code}\n`);
  log.end();
  process.exit(code ?? 1);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

async function hasBun() {
  try {
    await spawn("bun", ["--version"], { shell: true, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
