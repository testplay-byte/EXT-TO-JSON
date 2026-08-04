/**
 * ============================================================================
 *  decompiled.ts — Helpers for parsing jadx-decompiled Java source.
 *  ----------------------------------------------------------------------------
 *  jadx produces obfuscated, decompiled Java (not the original Kotlin). The
 *  patterns differ from what a naive Kotlin-source analyzer expects:
 *
 *    - Properties are `this.b = str2` (field assignments), not `val name = "..."`.
 *    - The entry subclass calls `super("en", "Anikoto", listOf(...), ...)`
 *      with the real lang/name/domains.
 *    - Preferences use `setKey("...")` / `setTitle("...")` method calls,
 *      not `key = PREF_X_KEY` constant references.
 *    - Request URLs use `HttpUrl.Builder.addPathSegment("...")` +
 *      `addQueryParameter("page", ...)`, not string concatenation.
 *
 *  This module extracts these patterns reliably from decompiled Java.
 * ============================================================================
 */

import { readFileSync } from "node:fs";

/** Find the entry subclass (the one named in the manifest meta-data). */
export function findEntryClass(
  files: string[],
  manifestHint: string | undefined,
): { file: string; className: string; src: string } | null {
  if (!manifestHint) return null;
  const simple = manifestHint.split(".").pop() ?? manifestHint;
  for (const file of files) {
    // Match by filename: .../<simple>.java
    const base = file.split("/").pop()?.replace(/\.java$/, "") ?? "";
    if (base === simple) {
      try {
        const src = readFileSync(file, "utf8");
        return { file, className: simple, src };
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/**
 * Parse a `super(...)` call in the entry subclass to extract string + list
 * arguments. Returns the raw arg tokens (strings unwrapped, arrays as string[]).
 *
 * Handles:
 *   super("en", "Anikoto", listOf("a","b"), listOf("c"))
 *   super("en", "Anikoto", CollectionsKt.listOf(new String[]{"a","b"}), ...)
 */
export function parseSuperCall(
  entrySrc: string,
): { strings: string[]; lists: string[][] } | null {
  const m = /super\s*\(\s*([\s\S]*?)\)\s*;/.exec(entrySrc);
  if (!m) return null;
  const args = splitArgs(m[1]);
  const strings: string[] = [];
  const lists: string[][] = [];
  for (const arg of args) {
    const trimmed = arg.trim();
    // String literal
    const sm = /^"((?:\\.|[^"\\])*)"$/.exec(trimmed);
    if (sm) {
      strings.push(sm[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
      continue;
    }
    // listOf(...) or CollectionsKt.listOf(new String[]{...}) or arrayOf(...)
    const lm =
      /(?:CollectionsKt\.)?listOf\s*\(\s*new\s+String\s*\[\s*\]\s*\{([^}]*)\}\s*\)/.exec(
        trimmed,
      ) ||
      /(?:CollectionsKt\.)?listOf\s*\(\s*\{([^}]*)\}\s*\)/.exec(trimmed) ||
      /listOf\s*\(([\s\S]*?)\)/.exec(trimmed) ||
      /arrayOf\s*\(\s*new\s+String\s*\[\s*\]\s*\{([^}]*)\}\s*\)/.exec(trimmed) ||
      /new\s+String\s*\[\s*\]\s*\{([^}]*)\}/.exec(trimmed);
    if (lm) {
      lists.push(extractStringLiterals(lm[1]));
    }
  }
  return { strings, lists };
}

/** Split a comma-separated arg list, respecting parens/braces/quotes. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === "\\") {
        cur += s[++i] ?? "";
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      cur += ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      cur += ch;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Extract all "..." string literals from a code fragment. */
export function extractStringLiterals(code: string): string[] {
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }
  return out;
}

/**
 * Parse `setupPreferenceScreen` body for `setKey(...)`/`setTitle(...)`/...
 * method calls. Returns one PreferenceDef per `new ListPreference(...)` block
 * (or equivalent). Each block is the statements between `new XxxPreference`
 * and the next `addPreference(...)`.
 *
 * Decompiled pattern:
 *   ListPreference listPreference = new ListPreference(preferenceScreen.getContext());
 *   listPreference.setKey("preferred_domain");
 *   listPreference.setTitle("Preferred Domain");
 *   listPreference.setEntries((CharSequence[]) this.c.toArray(new String[0]));
 *   listPreference.setEntryValues((CharSequence[]) this.h.toArray(new String[0]));
 *   listPreference.setDefaultValue(this.f);
 *   listPreference.setSummary("%s");
 *   preferenceScreen.addPreference(listPreference);
 */
export function parsePreferenceScreen(
  body: string,
  sourceClassSrc: string,
): {
  key: string;
  title: string;
  type: string;
  entries?: string[];
  entryValues?: string[];
  defaultValue?: string;
  isDomain?: boolean;
}[] {
  const prefs: {
    key: string;
    title: string;
    type: string;
    entries?: string[];
    entryValues?: string[];
    defaultValue?: string;
    isDomain?: boolean;
  }[] = [];

  // Split the body into blocks ending at `preferenceScreen.addPreference(...)`.
  const blocks = body.split(/preferenceScreen\.addPreference\s*\(/);
  // The first chunk is anything before the first addPreference (skip it).
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i - 1]; // the block BEFORE this addPreference call
    if (!block) continue;
    const pref = parsePrefBlock(block, sourceClassSrc);
    if (pref) prefs.push(pref);
  }
  return prefs;
}

function parsePrefBlock(
  block: string,
  sourceClassSrc: string,
):
  | {
      key: string;
      title: string;
      type: string;
      entries?: string[];
      entryValues?: string[];
      defaultValue?: string;
      isDomain?: boolean;
      category?: string;
    }
  | null {
  // Detect type
  let type = "unknown";
  if (/MultiSelectListPreference/.test(block)) type = "multiselect";
  else if (/SwitchPreference|SwitchCompatPreference|CheckBoxPreference/.test(block))
    type = "switch";
  else if (/EditTextPreference/.test(block)) type = "text";
  else if (/ListPreference/.test(block)) type = "list";
  else if (/PreferenceCategory/.test(block)) type = "category";
  else if (/Preference\b/.test(block) && !/PreferenceScreen/.test(block))
    type = "info";

  const key = readSetCall(block, "setKey")?.[0];
  const title = readSetCall(block, "setTitle")?.[0];
  // For category preferences, the title is the category name; key may be absent.
  if (type === "category") {
    return {
      key: key || `(category:${title || "untitled"})`,
      title: title || "(untitled category)",
      type,
      isDomain: false,
      category: title,
    };
  }
  if (!key || !title) return null;

  // setEntries may take a string[] literal OR a field reference like this.c.toArray(...)
  let entries = resolveSetArrayCall(block, "setEntries", sourceClassSrc);
  let entryValues = resolveSetArrayCall(
    block,
    "setEntryValues",
    sourceClassSrc,
  );
  const def = readSetCall(block, "setDefaultValue");

  // Try to resolve field-reference defaults (e.g. setDefaultValue(this.f))
  let defaultValue = def?.[0];
  if (defaultValue && /^this\.\w+$/.test(defaultValue)) {
    // Look up the field's initializer in the source.
    const fieldName = defaultValue.replace(/^this\./, "");
    const resolved = resolveFieldInitializer(fieldName, sourceClassSrc);
    if (resolved) defaultValue = resolved;
  }

  // isDomain: only true for preferences that control the base URL / domain.
  // Be precise — "hoster_exclusion" contains "host" but is NOT a domain pref.
  const isDomain =
    /^(pref_)?domain|base_?url|^domain$|preferred_domain/i.test(key) ||
    /preferred domain|base\s*url/i.test(title);

  return { key, title, type, entries, entryValues, defaultValue, isDomain };
}

/**
 * Try to resolve a field initializer like `this.f = "https://..."` from the
 * source class. Returns the string value if found.
 */
function resolveFieldInitializer(
  fieldName: string,
  src: string,
): string | undefined {
  // this.fieldName = "value"
  const re = new RegExp(`this\\.${fieldName}\\s*=\\s*"([^"]*)"`);
  const m = re.exec(src);
  if (m) return m[1];
  // this.fieldName = "https://" + something  (concatenation — return the prefix)
  const concatRe = new RegExp(
    `this\\.${fieldName}\\s*=\\s*"(https?://[^"]*)"`,
  );
  const cm = concatRe.exec(src);
  if (cm) return cm[1];
  return undefined;
}

/** Read the string args of a `setXxx("...")` call. */
function readSetCall(block: string, method: string): string[] | undefined {
  const re = new RegExp(`\\.${method}\\s*\\(`, "g");
  const m = re.exec(block);
  if (!m) return undefined;
  // Find the matching close paren.
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < block.length && depth > 0) {
    if (block[i] === "(") depth++;
    else if (block[i] === ")") depth--;
    if (depth === 0) break;
    i++;
  }
  const inner = block.slice(start, i);
  // If it's a string literal, unwrap it.
  const sm = /^"((?:\\.|[^"\\])*)"\s*$/.exec(inner.trim());
  if (sm) return [sm[1]];
  // Otherwise return the raw expression (may be a field ref).
  return [inner.trim()];
}

/**
 * Resolve a setEntries/setEntryValues call. Handles:
 *  - Array literals: { "a", "b" } or new String[]{ "a", "b" }
 *  - Field refs: (CharSequence[]) this.c.toArray(new String[0])
 *  - Static constant refs: S, U, W, X (single-letter static final String[] fields)
 *  - Local variable refs: strArr (where `String[] strArr = S;` earlier in block)
 */
function resolveSetArrayCall(
  block: string,
  method: string,
  sourceClassSrc: string,
): string[] | undefined {
  const re = new RegExp(`\\.${method}\\s*\\(`, "g");
  const m = re.exec(block);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < block.length && depth > 0) {
    if (block[i] === "(") depth++;
    else if (block[i] === ")") depth--;
    if (depth === 0) break;
    i++;
  }
  let inner = block.slice(start, i).trim();

  // Strip casts: (CharSequence[]) expr  ->  expr
  inner = inner.replace(/^\(\s*CharSequence\[\]\s*\)\s*/, "");
  // Strip (String[]) casts
  inner = inner.replace(/^\(\s*String\[\]\s*\)\s*/, "");

  // Case 1: array literal { "a", "b" }
  if (inner.startsWith("{") || inner.startsWith("new String[")) {
    return extractStringLiterals(inner);
  }

  // Case 2: field ref: this.c.toArray(new String[0])
  const fieldMatch = /this\.(\w+)\.toArray/.exec(inner);
  if (fieldMatch) {
    // The field is assigned in the constructor from a super() arg.
    // The caller (analyzeSettingsDecompiled) handles domain list injection.
    return undefined;
  }

  // Case 3: static constant ref (single letter like S, U, W, X, or multi-letter)
  // Try to find: static final String[] NAME = { "a", "b" };
  // or:          String[] NAME = { "a", "b" };
  // or:          NAME = strArr;  (where strArr is a local assigned from a constant)
  if (/^[A-Za-z_]\w*$/.test(inner)) {
    // First, check if it's a local variable assigned earlier in the block.
    const localVarRe = new RegExp(
      `String\\[\\]\\s+${inner}\\s*=\\s*([A-Za-z_]\\w*)`,
    );
    const lvm = localVarRe.exec(block);
    if (lvm) {
      // Recurse: resolve the variable it was assigned from.
      const constName = lvm[1];
      const resolved = resolveStaticArray(constName, sourceClassSrc);
      if (resolved) return resolved;
    }
    // Try as a static/class constant.
    const resolved = resolveStaticArray(inner, sourceClassSrc);
    if (resolved) return resolved;
  }

  // Case 4: try to extract any string literals from the expression.
  const literals = extractStringLiterals(inner);
  return literals.length > 0 ? literals : undefined;
}

/** Resolve a static final String[] constant from the source class. */
function resolveStaticArray(
  name: string,
  src: string,
): string[] | undefined {
  // static final String[] NAME = { "a", "b" };
  // String[] NAME = { "a", "b" };
  // private static final String[] NAME = { "a", "b" };
  const re = new RegExp(
    `(?:static\\s+)?(?:final\\s+)?String\\[\\]\\s+${name}\\s*=\\s*\\{([^}]*)\\}`,
  );
  const m = re.exec(src);
  if (m) {
    const literals = extractStringLiterals("{" + m[1] + "}");
    if (literals.length > 0) return literals;
  }
  // NAME = strArr;  (static block assignment)
  const assignRe = new RegExp(`\\b${name}\\s*=\\s*([A-Za-z_]\\w*)\\s*[;]`);
  const am = assignRe.exec(src);
  if (am && am[1] !== name) {
    // The RHS is another variable — try to resolve it as an array literal.
    const arrRe = new RegExp(
      `String\\[\\]\\s+${am[1]}\\s*=\\s*\\{([^}]*)\\}`,
    );
    const arrm = arrRe.exec(src);
    if (arrm) {
      return extractStringLiterals("{" + arrm[1] + "}");
    }
  }
  return undefined;
}

/**
 * Build a URL template from an HttpUrl.Builder pattern.
 *
 *   HttpUrl.Builder newBuilder = HttpUrl.Companion.get(getBaseUrl()).newBuilder();
 *   newBuilder.addPathSegment("most-viewed");
 *   newBuilder.addPathSegment("");
 *   newBuilder.addQueryParameter("page", String.valueOf(i));
 *
 * -> "{baseUrl}/most-viewed?page={page}"
 */
export function buildUrlFromBuilderPattern(
  methodBody: string,
): string | null {
  // Collect addPathSegment("...") in order
  const pathSegs: string[] = [];
  const pathRe = /addPathSegment\s*\(\s*"([^"]*)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(methodBody)) !== null) {
    if (m[1]) pathSegs.push(m[1]);
  }
  // Collect addQueryParameter("name", ...) — only capture the NAME, not the
  // value expression. The value in decompiled Java often contains nested
  // parens (e.g. String.valueOf(i)) which break naive regex matching. Since
  // we only need the name to build the placeholder, we match just up to the
  // comma after the name string.
  const queryParts: string[] = [];
  const qRe = /addQueryParameter\s*\(\s*"([^"]+)"\s*,/g;
  while ((m = qRe.exec(methodBody)) !== null) {
    const name = m[1];
    // Map by name: "page" -> {page}, "keyword"/"query" -> {query}, etc.
    if (name === "page" || /^p$/.test(name)) {
      queryParts.push(`${name}={page}`);
    } else if (/keyword|query|^q$|search/.test(name)) {
      queryParts.push(`${name}={query}`);
    } else {
      // Value is a variable or method call — use a placeholder named after the param.
      queryParts.push(`${name}={${name}}`);
    }
  }

  // Also detect addEncodedQueryParameter("name", ...) — same pattern.
  const eqRe = /addEncodedQueryParameter\s*\(\s*"([^"]+)"\s*,/g;
  while ((m = eqRe.exec(methodBody)) !== null) {
    const name = m[1];
    if (name === "page" || /^p$/.test(name)) {
      queryParts.push(`${name}={page}`);
    } else if (/keyword|query|^q$|search/.test(name)) {
      queryParts.push(`${name}={query}`);
    } else {
      queryParts.push(`${name}={${name}}`);
    }
  }

  if (pathSegs.length === 0 && queryParts.length === 0) return null;
  let url = "{baseUrl}";
  for (const seg of pathSegs) {
    url += "/" + seg;
  }
  if (queryParts.length > 0) {
    url += "?" + queryParts.join("&");
  }
  return url;
}
