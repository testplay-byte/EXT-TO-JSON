/**
 * persist.ts — Save a converted ExtensionJson to disk + database.
 *
 * The on-disk file (converted/<id>.json) is the canonical artifact (synced to
 * GitHub for persistence). The DB row powers fast listing/lookup.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import type { ExtensionJson } from "./types";

export const CONVERTED_DIR = join(process.cwd(), "converted");

export interface SavedExtension {
  id: string;
  jsonFilePath: string;
}

export async function persistExtension(json: ExtensionJson): Promise<SavedExtension> {
  // Upsert by packageName (one row per source package).
  const existing = await db.extension.findUnique({
    where: { packageName: json.meta.packageName },
  });
  const id = existing?.id ?? randomId();

  mkdirSync(CONVERTED_DIR, { recursive: true });
  const jsonFilePath = join(CONVERTED_DIR, `${id}.json`);
  writeFileSync(jsonFilePath, JSON.stringify(json, null, 2), "utf8");

  const data = {
    id,
    name: json.meta.name,
    lang: json.meta.lang,
    baseUrl: json.meta.baseUrl,
    packageName: json.meta.packageName,
    sourceType: json.meta.sourceType,
    sourceClassName: json.meta.sourceClassName,
    isNsfw: json.meta.isNsfw,
    apkFileName: json.converter.inputFile,
    apkSha256: json.converter.inputSha256,
    apkVersionCode: json.meta.apkVersionCode,
    apkVersionName: json.meta.apkVersionName,
    healthScore: json.health.score,
    healthStatus: json.health.status,
    healthSummary: json.health.summary,
    capabilities: JSON.stringify(json.capabilities),
    json: JSON.stringify(json),
    iconDataUrl: json.meta.iconDataUrl ?? null,
    jsonFilePath,
  };

  if (existing) {
    await db.extension.update({ where: { id }, data });
  } else {
    await db.extension.create({ data });
  }

  return { id, jsonFilePath };
}

/** Load a full ExtensionJson from disk by extension id. */
export function loadExtensionJson(id: string): ExtensionJson | null {
  const path = join(CONVERTED_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as ExtensionJson;
}

function randomId(): string {
  return (
    "ext_" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}
