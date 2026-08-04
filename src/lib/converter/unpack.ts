/**
 * unpack.ts — Decode an APK with apktool (async, non-blocking).
 *
 * apktool decodes: AndroidManifest.xml (to readable XML), resources (res/),
 * and smali. We use it primarily for the manifest + resource strings.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ToolchainPaths } from "./toolchain";

const execFileP = promisify(execFile);

export interface UnpackResult {
  outDir: string;
  manifestPath: string;
  resDir: string;
  apkPath: string;
  apkSizeBytes: number;
}

export async function unpackApk(
  apkPath: string,
  workDir: string,
  tools: ToolchainPaths,
): Promise<UnpackResult> {
  const outDir = join(workDir, "apktool-out");
  mkdirSync(outDir, { recursive: true });

  // apktool d -f --no-src -o <out> <apk>
  await execFileP(
    tools.javaBin,
    ["-jar", tools.apktoolJar, "d", "-f", "--no-src", "-o", outDir, apkPath],
    { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
  );

  const manifestPath = join(outDir, "AndroidManifest.xml");
  const resDir = join(outDir, "res");

  if (!existsSync(manifestPath)) {
    throw new Error(
      `apktool did not produce AndroidManifest.xml at ${manifestPath}`,
    );
  }

  const apkSizeBytes = statSync(apkPath).size;
  return { outDir, manifestPath, resDir, apkPath, apkSizeBytes };
}
