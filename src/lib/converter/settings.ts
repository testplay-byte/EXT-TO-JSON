/**
 * ============================================================================
 *  settings.ts — Extract user-configurable preferences from a decompiled source.
 * ============================================================================
 *
 *  Aniyomi extensions that implement `ConfigurableAnimeSource` override
 *  `setupPreferenceScreen(screen)` and add `ListPreference` / `EditTextPreference`
 *  / `SwitchPreference` / `MultiSelectListPreference` entries. Each preference
 *  is usually backed by companion-object constants:
 *
 *      private const val PREF_DOMAIN_KEY = "pref_domain_key"
 *      private const val PREF_DOMAIN_TITLE = "Preferred domain"
 *      private const val PREF_DOMAIN_DEFAULT = "https://animeblkom.net"
 *      private val PREF_DOMAIN_ENTRIES = arrayOf("animeblkom.net", "animeblkom.tv")
 *      private val PREF_DOMAIN_VALUES = arrayOf("https://animeblkom.net", ...)
 *
 *  This module:
 *    1. Finds `setupPreferenceScreen` (or `setupPreferenceScreen` variants).
 *    2. For each `XxxPreference(screen.context).apply { ... }` block, extracts
 *       key / title / entries / entryValues / defaultValue via the constants.
 *    3. Resolves constant references (PREF_X_KEY -> "pref_x_key") from the
 *       companion object / top-level constants.
 *    4. Flags domain preferences (key/title contains "domain" or "base_url").
 *
 *  It also detects `defaultBaseUrl` / `domainEntries` patterns used by multisrc
 *  themes so the converter can fall back to a real URL when `baseUrl` itself is
 *  preference-driven.
 * ============================================================================
 */
import type { PreferenceDef, PreferenceType } from "./types";

export interface SettingsAnalysis {
  configurable: boolean;
  preferences: PreferenceDef[];
  domainPreferenceKeys: string[];
  availableDomains: string[];
  /** A fallback base URL derived from preference defaults / domain lists. */
  fallbackBaseUrl?: string;
  notes: string[];
}

/** Resolve a PREF_X_... constant reference to its string value. */
function resolveConstant(
  constName: string,
  src: string,
): string | undefined {
  // const val NAME = "value"   OR   val NAME = "value"  OR  private val NAME = arrayOf(...)
  // Try string first
  const strRe = new RegExp(
    `(?:const\\s+)?val\\s+${escapeRegExp(constName)}\\s*=\\s*"([^"]*)"`,
  );
  const m = strRe.exec(src);
  if (m) return m[1];
  return undefined;
}

/** Resolve an arrayOf(...) constant to its string members. */
function resolveArrayConstant(
  constName: string,
  src: string,
): string[] {
  const re = new RegExp(
    `(?:const\\s+)?val\\s+${escapeRegExp(constName)}\\s*=\\s*arrayOf\\(([\\s\\S]*?)\\)`,
  );
  const m = re.exec(src);
  if (!m) return [];
  const body = m[1];
  const out: string[] = [];
  const sre = /"([^"]*)"/g;
  let sm: RegExpExecArray | null;
  while ((sm = sre.exec(body)) !== null) out.push(sm[1]);
  return out;
}

function resolveListConstant(constName: string, src: string): string[] {
  const re = new RegExp(
    `(?:const\\s+)?val\\s+${escapeRegExp(constName)}\\s*=\\s*listOf\\(([\\s\\S]*?)\\)`,
  );
  const m = re.exec(src);
  if (!m) return [];
  const body = m[1];
  const out: string[] = [];
  const sre = /"([^"]*)"/g;
  let sm: RegExpExecArray | null;
  while ((sm = sre.exec(body)) !== null) out.push(sm[1]);
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract the body of setupPreferenceScreen (best-effort brace matching). */
function extractMethodBody(src: string, methodName: string): string | null {
  const re = new RegExp(`\\b${methodName}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) break;
    i++;
  }
  return src.slice(start, i);
}

function detectPrefType(block: string): PreferenceType {
  if (/MultiSelectListPreference/.test(block)) return "multiselect";
  if (/SwitchPreference|SwitchCompatPreference|CheckBoxPreference/.test(block))
    return "switch";
  if (/EditTextPreference/.test(block)) return "text";
  if (/ListPreference/.test(block)) return "list";
  return "unknown";
}

/** Parse each `XxxPreference(...).apply { ... }` block inside setupPreferenceScreen. */
function parsePreferenceBlocks(
  body: string,
  src: string,
): PreferenceDef[] {
  const prefs: PreferenceDef[] = [];
  // Match: <Word>Preference(...).apply { ... }  — capture the class and the block.
  const blockRe =
    /(\w+Preference)\s*\([^)]*\)\s*\.apply\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body)) !== null) {
    const cls = m[1];
    // Find the matching closing brace for this apply block.
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    while (i < body.length && depth > 0) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
      if (depth === 0) break;
      i++;
    }
    const block = body.slice(start, i);

    const type = detectPrefType(`${cls}\n${block}`);

    // key = PREF_X_KEY  -> resolve constant
    let key = readAssign(block, "key");
    if (key && /^PREF_\w+$/.test(key)) key = resolveConstant(key, src) ?? key;

    let title = readAssign(block, "title");
    if (title && /^PREF_\w+$/.test(title))
      title = resolveConstant(title, src) ?? title;

    let entries = readAssign(block, "entries");
    let entryValues = readAssign(block, "entryValues");

    let entriesArr: string[] | undefined;
    let entryValuesArr: string[] | undefined;
    if (entries) {
      entriesArr = /^PREF_\w+$/.test(entries)
        ? resolveArrayConstant(entries, src).length
          ? resolveArrayConstant(entries, src)
          : resolveListConstant(entries, src)
        : unwrapArrayLiteral(entries);
    }
    if (entryValues) {
      entryValuesArr = /^PREF_\w+$/.test(entryValues)
        ? resolveArrayConstant(entryValues, src).length
          ? resolveArrayConstant(entryValues, src)
          : resolveListConstant(entryValues, src)
        : unwrapArrayLiteral(entryValues);
    }

    let def = readAssign(block, "setDefaultValue") ?? readAssign(block, "defaultValue");
    let defVal: string | boolean | string[] | undefined;
    if (def) {
      if (/^PREF_\w+$/.test(def)) def = resolveConstant(def, src) ?? def;
      if (def === "true" || def === "false") defVal = def === "true";
      else if (def.startsWith("arrayOf(") || def.startsWith("setOf(")) {
        defVal = unwrapArrayLiteral(def);
      } else {
        defVal = def.replace(/^"|"$/g, "");
      }
    }

    const isDomain =
      /domain|base_?url|mirror|host/i.test(key || "") ||
      /domain|base\s*url|mirror|host/i.test(title || "");

    // If entryValues is empty but entries exist (common when the source uses
    // `PREF_DOMAIN_VALUES by lazy { ENTRIES.map { "https://$it" } }`), synthesize
    // https:// values from the entries so the playground can use them directly.
    let finalEntries = entriesArr;
    let finalEntryValues = entryValuesArr;
    if (
      isDomain &&
      finalEntries &&
      finalEntries.length &&
      (!finalEntryValues || !finalEntryValues.length)
    ) {
      finalEntryValues = finalEntries.map((e) =>
        /^https?:\/\//.test(e) ? e : `https://${e}`,
      );
    }

    prefs.push({
      key: key || "(unknown)",
      title: title || "(untitled)",
      type,
      entries: finalEntries,
      entryValues: finalEntryValues,
      default: defVal,
      isDomainPreference: isDomain,
    });
  }
  return prefs;
}

function readAssign(block: string, field: string): string | undefined {
  // matches:  field = VALUE   where VALUE is a token (identifier or string literal or arrayOf(...))
  const re = new RegExp(`\\b${field}\\s*=\\s*([^\\n,;]+)`);
  const m = re.exec(block);
  if (!m) return undefined;
  let val = m[1].trim();
  // If it's an arrayOf(...)/setOf(...) spanning lines, grab up to the closing paren.
  if (/^(arrayOf|setOf|listOf)\(/.test(val)) {
    const start = block.indexOf(val, m.index);
    let depth = 0;
    let i = start + val.indexOf("(");
    depth = 1;
    const begin = i;
    while (i < block.length && depth > 0) {
      if (block[i] === "(") depth++;
      else if (block[i] === ")") depth--;
      if (depth === 0) break;
      i++;
    }
    val = block.slice(start, i + 1);
  }
  return val;
}

function unwrapArrayLiteral(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  return out;
}

/**
 * Detect a fallback base URL when `baseUrl` is preference-driven.
 * Looks for:
 *   - PREF_DOMAIN_DEFAULT = "https://..."
 *   - defaultBaseUrl = "https://${domainEntries.first()}" + domainEntries list
 *   - domainEntries = listOf("a", "b", ...)
 *   - any standalone https URL constant that looks like a site root
 */
function detectFallbackBaseUrl(
  src: string,
  prefs: PreferenceDef[],
): { url?: string; domains: string[] } {
  const domains: string[] = [];

  // 1. Direct PREF_DOMAIN_DEFAULT or any *_DEFAULT constant with an https URL.
  for (const p of prefs) {
    if (p.isDomainPreference && typeof p.default === "string") {
      const d = p.default;
      if (/^https?:\/\//.test(d)) {
        domains.push(d);
      }
    }
    if (p.isDomainPreference && p.entryValues) {
      for (const v of p.entryValues) {
        if (/^https?:\/\//.test(v) && !domains.includes(v)) domains.push(v);
      }
    }
    if (p.isDomainPreference && p.entries) {
      for (const v of p.entries) {
        // bare domain like "animeblkom.net"
        if (!/^https?:\/\//.test(v) && /\./.test(v) && !domains.includes(v)) {
          domains.push(v);
        }
      }
    }
  }

  // 2. domainEntries = listOf("a.to", "b.bz", ...)
  const deRe = /domainEntries\s*=\s*listOf\(([\\s\\S]*?)\)/;
  const deM = deRe.exec(src);
  if (deM) {
    const arr = unwrapArrayLiteral(deM[1]);
    for (const a of arr) {
      const full = /^https?:\/\//.test(a) ? a : `https://${a}`;
      if (!domains.includes(full)) domains.push(full);
    }
  }

  // 3. defaultBaseUrl = "https://..."
  const dbRe = /defaultBaseUrl\s*=\s*"(https?:\/\/[^"]+)"/;
  const dbM = dbRe.exec(src);
  if (dbM) {
    if (!domains.includes(dbM[1])) domains.push(dbM[1]);
  }

  // Pick the first https URL as the fallback.
  const url = domains.find((d) => /^https?:\/\//.test(d));
  return { url, domains };
}

/** Main entry: analyze a source file for settings + fallback baseUrl. */
export function analyzeSettings(src: string): SettingsAnalysis {
  const notes: string[] = [];
  const hasSetup =
    /setupPreferenceScreen\s*\(/.test(src) ||
    /ConfigurableAnimeSource/.test(src);

  if (!hasSetup) {
    return {
      configurable: false,
      preferences: [],
      domainPreferenceKeys: [],
      availableDomains: [],
      notes: ["Source is not configurable (no setupPreferenceScreen)."],
    };
  }

  const body = extractMethodBody(src, "setupPreferenceScreen");
  if (!body) {
    notes.push(
      "ConfigurableAnimeSource detected but setupPreferenceScreen body not found; falling back to constant scan.",
    );
    // Fall back to scanning all PREF_*_KEY constants.
    const prefs = scanConstantPrefs(src);
    const fb = detectFallbackBaseUrl(src, prefs);
    return {
      configurable: true,
      preferences: prefs,
      domainPreferenceKeys: prefs
        .filter((p) => p.isDomainPreference)
        .map((p) => p.key),
      availableDomains: fb.domains,
      fallbackBaseUrl: fb.url,
      notes,
    };
  }

  const prefs = parsePreferenceBlocks(body, src);
  notes.push(`Parsed ${prefs.length} preference(s) from setupPreferenceScreen.`);

  // Also scan for any PREF_* constants not referenced in the screen (belt+braces).
  const extra = scanConstantPrefs(src).filter(
    (p) => !prefs.some((x) => x.key === p.key),
  );
  if (extra.length) {
    notes.push(`Found ${extra.length} additional preference constant(s).`);
    prefs.push(...extra);
  }

  const fb = detectFallbackBaseUrl(src, prefs);
  if (fb.url) {
    notes.push(`Fallback base URL detected: ${fb.url}`);
  }
  if (fb.domains.length) {
    notes.push(`Available domains: ${fb.domains.join(", ")}`);
  }

  return {
    configurable: true,
    preferences: prefs,
    domainPreferenceKeys: prefs
      .filter((p) => p.isDomainPreference)
      .map((p) => p.key),
    availableDomains: fb.domains,
    fallbackBaseUrl: fb.url,
    notes,
  };
}

/** Scan for PREF_X_KEY constants and build minimal PreferenceDefs. */
function scanConstantPrefs(src: string): PreferenceDef[] {
  const prefs: PreferenceDef[] = [];
  const keyRe = /(?:const\s+)?val\s+(PREF_\w+_KEY)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = keyRe.exec(src)) !== null) {
    const keyConst = m[1];
    const keyVal = m[2];
    if (seen.has(keyVal)) continue;
    seen.add(keyVal);
    const base = keyConst.replace(/_KEY$/, "");
    const title = resolveConstant(`${base}_TITLE`, src) ?? keyVal;
    const def = resolveConstant(`${base}_DEFAULT`, src);
    const entries = resolveArrayConstant(`${base}_ENTRIES`, src);
    const entryValues = resolveArrayConstant(`${base}_VALUES`, src);
    const isDomain = /domain|base_?url|mirror|host/i.test(keyVal) || /domain|base\s*url|mirror|host/i.test(title);
    prefs.push({
      key: keyVal,
      title,
      type: entries.length || entryValues.length ? "list" : "text",
      entries: entries.length ? entries : undefined,
      entryValues: entryValues.length ? entryValues : undefined,
      default: def,
      isDomainPreference: isDomain,
    });
  }
  return prefs;
}
