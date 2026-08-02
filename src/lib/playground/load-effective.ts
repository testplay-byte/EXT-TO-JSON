/**
 * load-effective.ts — Load an extension JSON and apply saved user settings.
 *
 * The playground routes use this instead of raw loadExtensionJson so that
 * domain preferences (and other settings) are honoured when fetching.
 */
import { loadExtensionJson } from "@/lib/converter/persist";
import { loadSettings, effectiveSource } from "@/lib/converter/settings-store";
import type { ExtensionJson } from "@/lib/converter/types";

export function loadEffectiveExtension(id: string): ExtensionJson | null {
  const ext = loadExtensionJson(id);
  if (!ext) return null;
  const saved = loadSettings(id);
  // If there are saved settings, swap the source config (baseUrl etc.).
  if (Object.keys(saved).length > 0) {
    ext.source = effectiveSource(ext, saved);
    ext.meta.baseUrl = ext.source.baseUrl;
  }
  return ext;
}
