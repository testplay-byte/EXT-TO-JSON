/**
 * toolchain.ts — Locate and verify the apktool + jadx decompilation tools.
 *
 * The tools live in <repo>/tools/. On first run the Windows launcher (and the
 * dev setup script) download them; here we just resolve + verify.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface ToolchainPaths {
  apktoolJar: string;
  jadxBin: string;
  javaBin: string;
}

export interface ToolchainVersions {
  apktool: string;
  jadx: string;
  java: string;
}

async function run(
  cmd: string,
  args: string[],
  timeoutMs = 60000,
): Promise<string> {
  try {
    const { stdout, stderr } = await execFileP(cmd, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    return (stdout || stderr).trim();
  } catch (err) {
    // java -version prints to stderr; execFile throws on non-zero but we still
    // want the version string.
    const e = err as { stderr?: string; stdout?: string };
    return (e.stderr || e.stdout || "").trim();
  }
}

/** Resolve tool paths relative to the repo root (process.cwd()). */
export function resolveToolchain(): ToolchainPaths {
  const repoRoot = process.cwd();
  const apktoolJar = join(repoRoot, "tools", "apktool.jar");
  const jadxBin = join(repoRoot, "tools", "bin", "jadx");

  if (!existsSync(apktoolJar)) {
    throw new Error(
      `apktool.jar not found at ${apktoolJar}. Run the launcher / setup script to download the toolchain.`,
    );
  }
  if (!existsSync(jadxBin)) {
    throw new Error(
      `jadx not found at ${jadxBin}. Run the launcher / setup script to download the toolchain.`,
    );
  }

  const javaBin = process.env.JAVA_HOME
    ? join(process.env.JAVA_HOME, "bin", "java")
    : "java";

  return { apktoolJar, jadxBin, javaBin };
}

/** Verify each tool runs and capture its version string. */
export async function verifyToolchain(
  paths: ToolchainPaths,
): Promise<ToolchainVersions> {
  const [javaRaw, apktoolRaw, jadxRaw] = await Promise.all([
    run(paths.javaBin, ["-version"], 30000),
    run(paths.javaBin, ["-jar", paths.apktoolJar, "--version"], 60000),
    run(paths.jadxBin, ["--version"], 60000),
  ]);
  const java = javaRaw.split("\n")[0].replace(/"/g, "");
  return {
    apktool: apktoolRaw.split("\n")[0].trim(),
    jadx: jadxRaw.split("\n")[0].trim(),
    java,
  };
}

/** Best-effort detection; never throws (used for the API info endpoint). */
export async function detectToolchainVersions(): Promise<ToolchainVersions> {
  try {
    const paths = resolveToolchain();
    return await verifyToolchain(paths);
  } catch {
    return { apktool: "unknown", jadx: "unknown", java: "unknown" };
  }
}
