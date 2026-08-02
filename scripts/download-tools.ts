#!/usr/bin/env bun
/**
 * ============================================================================
 *  scripts/download-tools.ts — Cross-platform toolchain installer.
 * ============================================================================
 *
 *  Downloads apktool.jar (v2.9.3) and jadx (v1.4.7) into the repo's tools/
 *  directory if they are not already present. Used by:
 *
 *    - Non-Windows developers (macOS/Linux):  `bun run scripts/download-tools.ts`
 *    - CI / fresh-checkout bootstrap.
 *    - Fallback when START.bat cannot complete the download.
 *
 *  Requirements:
 *    - Bun (or Node 18+ with a global fetch).
 *    - `unzip` on PATH (Linux/macOS). On Windows, prefer START.bat which
 *      uses PowerShell Expand-Archive.
 *
 *  Idempotent: skips anything already present. Prints clear progress.
 * ============================================================================
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const TOOLS_DIR = join(REPO_ROOT, "tools");

const APKTOOL_URL =
  "https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar";
const APKTOOL_PATH = join(TOOLS_DIR, "apktool.jar");

const JADX_URL =
  "https://github.com/skylot/jadx/releases/download/v1.4.7/jadx-1.4.7.zip";
const JADX_ZIP_PATH = join(TOOLS_DIR, "jadx.zip");
const JADX_BIN_PATH = join(TOOLS_DIR, "bin", "jadx");
const JADX_BAT_PATH = join(TOOLS_DIR, "bin", "jadx.bat");

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function info(msg: string): void {
  console.log(`\x1b[36m[i]\x1b[0m ${msg}`);
}

function ok(msg: string): void {
  console.log(`\x1b[32m[ok]\x1b[0m ${msg}`);
}

function warn(msg: string): void {
  console.log(`\x1b[33m[!]\x1b[0m ${msg}`);
}

function fail(msg: string): void {
  console.error(`\x1b[31m[x]\x1b[0m ${msg}`);
}

async function download(url: string, dest: string): Promise<void> {
  info(`Downloading ${url}`);
  info(`           -> ${dest}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  // Bun/Node 18+ expose res.body as a web ReadableStream.
  const source = Readable.fromWeb(res.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(source, createWriteStream(dest));
  const size = statSync(dest).size;
  ok(`Saved ${dest} (${(size / 1024 / 1024).toFixed(2)} MiB)`);
}

/** Locate the `unzip` binary on PATH. Returns null if not found. */
function findUnzip(): string | null {
  const candidates = ["unzip"];
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ["-v"], { stdio: "ignore" });
    if (r.status === 0 || (r.error === undefined && r.status !== null)) {
      return cmd;
    }
  }
  return null;
}

/**
 * Extract a zip into a directory using the system `unzip` command. Falls back
 * to a clear error message instructing the user to install unzip or to use
 * START.bat on Windows. We do not implement a manual unzipper here — on every
 * supported platform a working unzip is available out of the box (or via the
 * OS package manager).
 */
function extractZip(zipPath: string, destDir: string): void {
  const unzip = findUnzip();
  if (!unzip) {
    warn(
      "`unzip` not found on PATH. On Debian/Ubuntu install with: sudo apt-get install unzip",
    );
    warn(
      "On macOS unzip ships with the OS. On Windows use START.bat (which uses PowerShell Expand-Archive).",
    );
    throw new Error("unzip command not available - cannot extract jadx.zip");
  }
  info(`Extracting ${zipPath} -> ${destDir} via ${unzip}`);
  // -o = overwrite without prompting, -q = quiet
  const r = spawnSync(unzip, ["-o", "-q", zipPath, "-d", destDir], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    throw new Error(`unzip exited with status ${r.status ?? "null"}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                      */
/* -------------------------------------------------------------------------- */

async function ensureApktool(): Promise<void> {
  if (existsSync(APKTOOL_PATH)) {
    ok(`apktool.jar already present at ${APKTOOL_PATH} - skipping.`);
    return;
  }
  await download(APKTOOL_URL, APKTOOL_PATH);
}

async function ensureJadx(): Promise<void> {
  // Either the unix launcher or the .bat counts as "installed".
  if (existsSync(JADX_BIN_PATH) || existsSync(JADX_BAT_PATH)) {
    ok(`jadx already present at ${JADX_BIN_PATH} - skipping.`);
    return;
  }
  // Clean any leftover partial extraction.
  if (existsSync(join(TOOLS_DIR, "bin"))) {
    rmSync(join(TOOLS_DIR, "bin"), { recursive: true, force: true });
  }
  if (existsSync(join(TOOLS_DIR, "lib"))) {
    rmSync(join(TOOLS_DIR, "lib"), { recursive: true, force: true });
  }

  await download(JADX_URL, JADX_ZIP_PATH);
  extractZip(JADX_ZIP_PATH, TOOLS_DIR);

  // Clean up the zip — we don't want to ship it.
  rmSync(JADX_ZIP_PATH, { force: true });

  if (!existsSync(JADX_BIN_PATH) && !existsSync(JADX_BAT_PATH)) {
    throw new Error(
      `jadx extraction completed but ${JADX_BIN_PATH} (or .bat) not found. ` +
        `Inspect ${TOOLS_DIR} manually.`,
    );
  }
  ok(`jadx extracted to ${TOOLS_DIR}/bin/`);
}

async function main(): Promise<void> {
  console.log("");
  console.log("EXT-TO-JSON toolchain installer");
  console.log("================================");
  console.log(`Repo root:  ${REPO_ROOT}`);
  console.log(`Tools dir:  ${TOOLS_DIR}`);
  console.log("");

  if (!existsSync(TOOLS_DIR)) {
    mkdirSync(TOOLS_DIR, { recursive: true });
  }

  const apktoolPresent = existsSync(APKTOOL_PATH);
  const jadxPresent =
    existsSync(JADX_BIN_PATH) || existsSync(JADX_BAT_PATH);

  if (apktoolPresent && jadxPresent) {
    ok("tools already present - nothing to do.");
    console.log("");
    console.log("  apktool.jar : " + APKTOOL_PATH);
    console.log("  jadx binary : " + (existsSync(JADX_BIN_PATH) ? JADX_BIN_PATH : JADX_BAT_PATH));
    console.log("");
    return;
  }

  try {
    await ensureApktool();
    await ensureJadx();
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
    console.log("");
    console.log("Troubleshooting:");
    console.log("  - Check your network connection (GitHub releases).");
    console.log("  - On Windows, use START.bat which uses PowerShell.");
    console.log("  - On Linux/macOS ensure `unzip` is installed.");
    process.exit(1);
  }

  console.log("");
  ok("Toolchain ready.");
  console.log("");
  console.log("Next steps:");
  console.log("  bun install            (or npm install)");
  console.log("  bun run db:push        (or npx prisma db push --accept-data-loss)");
  console.log("  bun run dev            (or npm run dev)");
  console.log("  open http://localhost:3000");
  console.log("");
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
