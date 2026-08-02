/**
 * decompile.ts — Decompile an APK's DEX to Java source with jadx (async).
 *
 * jadx reads the APK directly and produces a sources tree of .java files.
 * This is what the analyzer scans for the Source class.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ToolchainPaths } from "./toolchain";

const execFileP = promisify(execFile);

export interface DecompileResult {
  outDir: string;
  fileCount: number;
}

function countJavaFiles(dir: string): number {
  let count = 0;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = join(dir, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) count += countJavaFiles(full);
    else if (e.endsWith(".java")) count++;
  }
  return count;
}

export async function decompileApk(
  apkPath: string,
  workDir: string,
  tools: ToolchainPaths,
): Promise<DecompileResult> {
  const outDir = join(workDir, "jadx-out");
  mkdirSync(outDir, { recursive: true });

  // jadx -d <out> --no-res --show-bad-code --threads-count 4 <apk>
  await execFileP(
    tools.jadxBin,
    [
      "-d",
      outDir,
      "--no-res",
      "--show-bad-code",
      "--threads-count",
      "4",
      apkPath,
    ],
    { timeout: 300000, maxBuffer: 20 * 1024 * 1024 },
  );

  if (!existsSync(outDir)) {
    throw new Error(`jadx did not produce output at ${outDir}`);
  }

  return { outDir, fileCount: countJavaFiles(outDir) };
}
