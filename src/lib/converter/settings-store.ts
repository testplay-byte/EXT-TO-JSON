/**
 * settings-store.ts — Persist user-configured extension preference values.
 *
 * Stored on disk at /converted/<id>.settings.json so they survive restarts and
 * are synced to GitHub alongside the converted JSON. Keyed by extensionId.
 *
 * The playground reads these and applies them when fetching (e.g. swapping the
 * baseUrl to the selected domain).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionJson, PreferenceDef } from "./types";

export const CONVERTED_DIR = join(process.cwd(), "converted");

function settingsPath(extensionId: string): string {
  return join(CONVERTED_DIR, `${extensionId}.settings.json`);
}

/** Load saved preference values for an extension. Returns {} if none. */
export function loadSettings(extensionId: string): Record<string, string | boolean | string[]> {
  const p = settingsPath(extensionId);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

/** Save preference values for an extension. */
export function saveSettings(
  extensionId: string,
  values: Record<string, string | boolean | string[]>,
): void {
  try {
    writeFileSync(settingsPath(extensionId), JSON.stringify(values, null, 2), "utf8");
  } catch {
    /* ignore write errors */
  }
}

/**
 * Compute the effective baseUrl for an extension given saved settings.
 * If a domain preference exists and has a saved value, use it; otherwise use
 * the extension's default baseUrl.
 */
export function effectiveBaseUrl(
  ext: ExtensionJson,
  saved: Record<string, string | boolean | string[]>,
): string {
  const domainKey = ext.settings.domainPreferenceKeys[0];
  if (domainKey && saved[domainKey]) {
    const v = saved[domainKey];
    if (typeof v === "string") {
      // The saved value might be a bare domain or a full URL.
      return /^https?:\/\//.test(v) ? v : `https://${v}`;
    }
  }
  // Fall back to the first available domain if baseUrl is empty/placeholder.
  if (
    !ext.meta.baseUrl ||
    /server address|select/i.test(ext.meta.baseUrl)
  ) {
    return ext.settings.availableDomains.find((d) => /^https?:\/\//.test(d)) ?? ext.meta.baseUrl;
  }
  return ext.meta.baseUrl;
}

/** Build the effective source config (baseUrl swapped to the selected domain). */
export function effectiveSource(
  ext: ExtensionJson,
  saved: Record<string, string | boolean | string[]>,
): ExtensionJson["source"] {
  const baseUrl = effectiveBaseUrl(ext, saved);
  return {
    ...ext.source,
    baseUrl,
  };
}

/** Default values for all preferences (used to initialise the UI). */
export function defaultSettings(
  preferences: PreferenceDef[],
): Record<string, string | boolean | string[]> {
  const out: Record<string, string | boolean | string[]> = {};
  for (const p of preferences) {
    if (p.default !== undefined) {
      out[p.key] = p.default;
    } else if (p.type === "switch") {
      out[p.key] = false;
    } else if (p.entryValues && p.entryValues.length) {
      out[p.key] = p.entryValues[0];
    }
  }
  return out;
}
