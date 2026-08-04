/**
 * GET /api/toolchain — report whether apktool + jadx + java are available,
 * with version strings. The UI uses this to surface setup problems clearly.
 */
import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveToolchain, detectToolchainVersions } from "@/lib/converter/toolchain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const repoRoot = process.cwd();
  const apktoolJar = join(repoRoot, "tools", "apktool.jar");
  const jadxBin = join(repoRoot, "tools", "bin", "jadx");

  const apktoolPresent = existsSync(apktoolJar);
  const jadxPresent = existsSync(jadxBin);

  let javaPresent = false;
  let versions: { apktool: string; jadx: string; java: string } = {
    apktool: "unknown",
    jadx: "unknown",
    java: "unknown",
  };
  let error: string | undefined;

  try {
    const paths = resolveToolchain();
    javaPresent = true;
    versions = await detectToolchainVersions();
    if (versions.apktool === "unknown") {
      error = "apktool.jar found but failed to execute. Check Java installation.";
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    ready: apktoolPresent && jadxPresent && javaPresent && versions.java !== "unknown",
    tools: {
      java: { present: javaPresent, version: versions.java },
      apktool: { present: apktoolPresent, version: versions.apktool },
      jadx: { present: jadxPresent, version: versions.jadx },
    },
    error,
    paths: { apktoolJar, jadxBin },
  });
}
