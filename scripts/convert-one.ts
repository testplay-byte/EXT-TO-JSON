#!/usr/bin/env bun
/**
 * scripts/convert-one.ts — CLI utility to convert a single APK to JSON.
 * Usage: bun run scripts/convert-one.ts <path-to.apk> [out.json]
 *
 * Prints progress to stderr and writes the resulting JSON to stdout (or file).
 */
import { convertApk } from "../src/lib/converter/convert";
import { writeFileSync } from "node:fs";

const apkPath = process.argv[2];
const outPath = process.argv[3];

if (!apkPath) {
  console.error("Usage: bun run scripts/convert-one.ts <apk> [out.json]");
  process.exit(1);
}

const result = await convertApk(apkPath, apkPath.split("/").pop() ?? "input.apk", {
  onProgress: (stage, progress, message) => {
    process.stderr.write(`[${stage}] ${progress}% — ${message}\n`);
  },
});

const json = JSON.stringify(result.json, null, 2);
if (outPath) {
  writeFileSync(outPath, json);
  console.error(`Wrote ${outPath} (${json.length} bytes) in ${result.durationMs}ms`);
} else {
  process.stdout.write(json + "\n");
}
