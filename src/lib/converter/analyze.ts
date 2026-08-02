/**
 * ============================================================================
 *  analyze.ts — Scan the jadx-decompiled Java source to extract the extension
 *  structure and produce a SourceAnalysis that convert.ts maps to ExtensionJson.
 * ============================================================================
 *
 *  Strategy (heuristic, robust, transparent):
 *   1. Walk the decompiled tree for classes extending a known Aniyomi base
 *      (ParsedAnimeHttpSource / AnimeHttpSource / ParsedHttpSource / HttpSource).
 *   2. Pick the best candidate (most overridden methods, or the one referenced
 *      by the manifest's tachiyomi.extension.class meta-data).
 *   3. From the chosen class file, extract:
 *        - properties: name, baseUrl, lang, versionId, isNsfw
 *        - overridden method names  -> capabilities
 *        - ParsedHttpSource selector methods -> CSS selectors
 *        - request methods -> URL string literals (best-effort URL template)
 *        - FromElement methods -> Jsoup select/attr/text selectors
 *        - getFilterList -> filter names + types
 *        - video servers -> known extractor names in string literals
 *
 *  Everything uncertain is recorded in RawAnalysis.analyzerNotes so the health
 *  report can flag it. Nothing is silently hidden.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  Capabilities,
  RawAnalysis,
  SourceType,
} from "./types";
import { analyzeSettings, type SettingsAnalysis } from "./settings";
import {
  findEntryClass,
  parseSuperCall,
  parsePreferenceScreen,
  buildUrlFromBuilderPattern,
} from "./decompiled";

const BASE_CLASSES: Record<string, SourceType> = {
  ParsedAnimeHttpSource: "ParsedAnimeHttpSource",
  AnimeHttpSource: "AnimeHttpSource",
  ParsedHttpSource: "ParsedHttpSource",
  HttpSource: "HttpSource",
  AnimeSource: "AnimeSource",
};

// Anime method names (ParsedAnimeHttpSource / AnimeHttpSource)
const ANIME_METHODS = [
  "popularAnimeRequest",
  "popularAnimeParse",
  "popularAnimeSelector",
  "popularAnimeFromElement",
  "popularAnimeNextPageSelector",
  "latestUpdatesRequest",
  "latestUpdatesParse",
  "latestUpdatesSelector",
  "latestUpdatesFromElement",
  "latestUpdatesNextPageSelector",
  "searchAnimeRequest",
  "searchAnimeParse",
  "searchAnimeSelector",
  "searchAnimeFromElement",
  "searchAnimeNextPageSelector",
  "animeDetailsParse",
  "animeDetailsFromElement",
  "episodeListRequest",
  "episodeListParse",
  "episodeListSelector",
  "episodeFromElement",
  "episodeNextPageSelector",
  "videoListRequest",
  "videoListParse",
  "videoListSelector",
  "videoFromElement",
  "videoUrlParse",
  "getFilterList",
  "getVideoList",
] as const;

// Manga method names
const MANGA_METHODS = [
  "popularMangaRequest",
  "popularMangaParse",
  "popularMangaSelector",
  "popularMangaFromElement",
  "popularMangaNextPageSelector",
  "latestUpdatesRequest",
  "latestUpdatesParse",
  "latestUpdatesSelector",
  "latestUpdatesFromElement",
  "latestUpdatesNextPageSelector",
  "searchMangaRequest",
  "searchMangaParse",
  "searchMangaSelector",
  "searchMangaFromElement",
  "searchMangaNextPageSelector",
  "mangaDetailsParse",
  "mangaDetailsFromElement",
  "chapterListRequest",
  "chapterListParse",
  "chapterListSelector",
  "chapterFromElement",
  "chapterNextPageSelector",
  "pageListRequest",
  "pageListParse",
  "pageListSelector",
  "fetchImageUrl",
  "getImageUrl",
  "getFilterList",
] as const;

// Known video server / extractor names commonly referenced in extensions.
const KNOWN_EXTRACTORS = [
  "vidstream",
  "vidstreaming",
  "streamtape",
  "mp4upload",
  "doodstream",
  "dood",
  "filemoon",
  "gogo",
  "gogostream",
  "kwik",
  "mixdrop",
  "streamlare",
  "streamwish",
  "fembed",
  "hd-2",
  "vkontakte",
  "sendvid",
  "streamsb",
  "streamhub",
  "upstream",
  "voe",
  "yourupload",
  "zto",
  "pahome",
  "miruro",
  "aniwatch",
  "zoro",
  "kaido",
];

export interface SourceAnalysis {
  sourceClassFile: string;
  sourceClassName: string;
  sourceType: SourceType;
  candidateClasses: string[];
  methodOverrides: string[];
  properties: {
    name?: string;
    baseUrl?: string;
    lang?: string;
    versionId?: number;
    isNsfw?: boolean;
  };
  selectors: Record<string, string>;
  requestUrls: Record<string, string[]>;
  fromElementSelectors: Record<string, string[]>;
  filters: { name: string; type: string; values?: string[] }[];
  detectedExtractors: string[];
  stringLiterals: { method: string; values: string[] }[];
  settings: import("./settings").SettingsAnalysis;
  notes: string[];
}

/** Recursively collect .java files under a directory. */
function collectJavaFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectJavaFiles(full, acc);
    } else if (e.endsWith(".java")) {
      acc.push(full);
    }
  }
  return acc;
}

/** Extract all string literals from a code chunk. */
function extractStrings(code: string): string[] {
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  }
  return out;
}

/** Find the source class among decompiled files. */
function findSourceCandidates(
  files: string[],
): { file: string; className: string; baseType: SourceType; score: number }[] {
  const candidates: {
    file: string;
    className: string;
    baseType: SourceType;
    score: number;
  }[] = [];
  for (const file of files) {
    let src = "";
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const [base, type] of Object.entries(BASE_CLASSES)) {
      // match: class X extends Y   or   class X extends Y<...>
      const re = new RegExp(
        `class\\s+(\\w+)\\s+extends\\s+${base}\\b`,
      );
      const m = re.exec(src);
      if (m) {
        // score by number of known overridden methods present
        const allMethods = [...ANIME_METHODS, ...MANGA_METHODS];
        let score = 0;
        for (const meth of allMethods) {
          if (new RegExp(`\\b${meth}\\s*\\(`).test(src)) score++;
        }
        candidates.push({
          file,
          className: m[1],
          baseType: type,
          score,
        });
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

/** Extract a property value (field initializer or getter return). */
function extractProperty(
  src: string,
  propName: string,
): string | undefined {
  // getter: String getBaseUrl() { return "..."; }
  const getterRe = new RegExp(
    `String\\s+get${propName.charAt(0).toUpperCase()}${propName.slice(
      1,
    )}\\s*\\(\\s*\\)\\s*\\{[\\s\\S]*?return\\s+"([^"]*)"`,
  );
  const gm = getterRe.exec(src);
  if (gm) return gm[1];
  // field initializer with type/modifier prefix: val baseUrl = "..." / String baseUrl = "..."
  const fieldRe = new RegExp(
    `(?:String|boolean|int|long|private|public|protected|final|static|val|var)\\s+${propName}\\s*=\\s*"([^"]*)"`,
  );
  const fm = fieldRe.exec(src);
  if (fm) return fm[1];
  // this.field assignment: this.baseUrl = "..."  (decompiled Java style)
  const thisRe = new RegExp(`this\\.${propName}\\s*=\\s*"([^"]*)"`);
  const tm = thisRe.exec(src);
  if (tm) return tm[1];
  return undefined;
}

/**
 * Extract the baseUrl with URL validation. A non-URL value (e.g. a placeholder
 * like "The server address" or a mis-extracted name) is discarded so the
 * fallback chain (settings default → domain list → URL scan) can take over.
 */
function extractBaseUrl(src: string): string | undefined {
  const raw = extractProperty(src, "baseUrl");
  if (raw && /^https?:\/\//.test(raw)) return raw;
  return undefined;
}

function extractBoolProperty(src: string, propName: string): boolean | undefined {
  const re = new RegExp(
    `boolean\\s+is${propName.charAt(0).toUpperCase()}${propName.slice(
      1,
    )}\\s*\\(\\s*\\)\\s*\\{[\\s\\S]*?return\\s+(true|false)`,
  );
  const m = re.exec(src);
  if (m) return m[1] === "true";
  const f = new RegExp(`\\b${propName}\\s*=\\s*(true|false)`);
  const fm = f.exec(src);
  if (fm) return fm[1] === "true";
  return undefined;
}

function extractIntProperty(src: string, propName: string): number | undefined {
  const re = new RegExp(`\\b${propName}\\s*=\\s*(\\d+)`);
  const m = re.exec(src);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

/** Extract the body of a method (best-effort brace matching). */
function extractMethodBody(src: string, methodName: string): string | null {
  // match "methodName(" possibly with params, then "{ ... }"
  const re = new RegExp(
    `\\b${methodName}\\s*\\([^)]*\\)\\s*\\{`,
  );
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

/** Extract the first return-string-literal of a selector method. */
function extractSelectorReturn(
  methodBody: string,
): string | undefined {
  const re = /return\s+"([^"]+)"/;
  const m = re.exec(methodBody);
  return m?.[1];
}

/** Extract Jsoup selectors used inside a FromElement method. */
function extractJsoupSelectors(methodBody: string): string[] {
  const out: string[] = [];
  const re = /\.select\s*\(\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(methodBody)) !== null) out.push(m[1]);
  const attrRe = /\.selectFirst\s*\(\s*"([^"]+)"/g;
  while ((m = attrRe.exec(methodBody)) !== null) out.push(m[1]);
  return out;
}

/** Build a best-effort URL template from a request method body. */
function buildUrlTemplate(
  methodBody: string,
  baseUrl: string | undefined,
): { template: string; literals: string[] } {
  const literals = extractStrings(methodBody);
  // Heuristic: find a string literal that looks like a path "/..." or full URL
  const pathLike = literals.find(
    (s) =>
      s.startsWith("/") ||
      /^https?:\/\//.test(s) ||
      s.includes("{") ||
      /\bpage\b/i.test(s) ||
      s.includes("="),
  );
  let template = "";
  if (pathLike) {
    if (/^https?:\/\//.test(pathLike)) {
      template = pathLike;
    } else if (baseUrl && pathLike.startsWith("/")) {
      template = baseUrl + pathLike;
    } else {
      template = pathLike;
    }
  } else if (literals.length) {
    template = literals[0];
  }
  // Replace dynamic concatenation hints with placeholders.
  // Common: baseUrl + "/popular?page=" + page  -> baseUrl + "/popular?page={page}"
  // We look for the pattern: "..." + <ident>  and map ident -> placeholder.
  const concatRe = /"([^"]*)"\s*\+\s*(\w+)/g;
  let cm: RegExpExecArray | null;
  let built = template;
  if (methodBody.includes("+")) {
    // Reconstruct the concatenation chain starting from the first string literal.
    const firstStr = literals[0];
    if (firstStr !== undefined) {
      built = firstStr;
      let rest = methodBody.slice(methodBody.indexOf(`"${firstStr}"`) + firstStr.length + 2);
      const stepRe = /\s*\+\s*("?)([^"+]+)\1/g;
      let sm: RegExpExecArray | null;
      while ((sm = stepRe.exec(rest)) !== null) {
        const isStr = sm[1] === '"';
        const token = sm[2].trim();
        if (isStr) {
          built += token;
        } else {
          // identifier -> placeholder
          const low = token.toLowerCase();
          if (low.includes("page")) built += "{page}";
          else if (low.includes("query") || low.includes("search") || low.includes("q"))
            built += "{query}";
          else if (low.includes("url")) built += "{animeUrl}";
          else built += `{${token}}`;
        }
        if (sm.index + sm[0].length >= rest.length) break;
      }
      if (!/^https?:\/\//.test(built) && baseUrl && built.startsWith("/")) {
        built = baseUrl + built;
      }
    }
  }
  return { template: built, literals };
}

/** Detect filters from getFilterList body. */
function detectFilters(methodBody: string | null): {
  name: string;
  type: string;
  values?: string[];
}[] {
  if (!methodBody) return [];
  const out: { name: string; type: string; values?: string[] }[] = [];
  // new Header("..."), new SortFilter("...", ...), new SelectFilter("...", ...)
  // Generic: capture first string literal per "new XxxFilter(" / "new Header("
  const re = /new\s+(\w+)\s*\(\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(methodBody)) !== null) {
    const cls = m[1];
    const name = m[2];
    if (seen.has(name)) continue;
    seen.add(name);
    let type = "header";
    if (/Sort/i.test(cls)) type = "sort";
    else if (/Select|Category|Genre/i.test(cls)) type = "select";
    else if (/Text/i.test(cls)) type = "text";
    else if (/Checkbox|Check/i.test(cls)) type = "checkbox";
    else if (/Header|Separator|Divider/i.test(cls)) type = "header";
    out.push({ name, type });
  }
  return out;
}

/** Detect known extractor names mentioned in source string literals. */
function detectExtractors(allStrings: string[]): string[] {
  const found = new Set<string>();
  for (const s of allStrings) {
    const lower = s.toLowerCase();
    for (const ex of KNOWN_EXTRACTORS) {
      if (lower.includes(ex)) found.add(ex);
    }
  }
  return [...found];
}

export function analyzeSource(
  jadxOutDir: string,
  manifestClassHint: string | undefined,
): SourceAnalysis {
  const notes: string[] = [];
  const sourcesDir = jadxOutDir; // jadx outputs sources at outDir root
  const files = collectJavaFiles(sourcesDir);
  notes.push(`Scanned ${files.length} .java files from jadx output.`);

  const candidates = findSourceCandidates(files);
  if (candidates.length === 0) {
    notes.push(
      "No class extending a known Aniyomi base was found. Conversion will be limited to manifest data.",
    );
    return emptyAnalysis(jadxOutDir, notes);
  }

  notes.push(
    `Found ${candidates.length} candidate source class(es): ${candidates
      .map((c) => `${c.className} (${c.baseType}, score=${c.score})`)
      .join(", ")}`,
  );

  // Prefer the manifest hint if it matches a candidate.
  let chosen = candidates[0];
  if (manifestClassHint) {
    const hintSimple = manifestClassHint.split(".").pop() ?? "";
    const hintSegments = manifestClassHint.split(".");
    const match = candidates.find(
      (c) =>
        c.className === hintSimple ||
        hintSegments.includes(c.className) ||
        c.file.replace(/\\/g, "/").includes(manifestClassHint.replace(/\./g, "/")),
    );
    if (match) {
      chosen = match;
      notes.push(`Selected source class via manifest hint: ${chosen.className}`);
    } else {
      notes.push(
        `Manifest hint '${manifestClassHint}' did not match any candidate; using top-scored ${chosen.className}.`,
      );
    }
  } else {
    notes.push(`Selected top-scored source class: ${chosen.className}`);
  }

  let src = "";
  try {
    src = readFileSync(chosen.file, "utf8");
  } catch {
    notes.push(`Could not read source file ${chosen.file}.`);
    return emptyAnalysis(jadxOutDir, notes, chosen);
  }

  // ---- Entry subclass (the real extension class named in the manifest) ----
  // The entry subclass passes the real lang/name/domains to the (possibly
  // obfuscated) multisrc base via super(...). Parse it.
  let entryLang: string | undefined;
  let entryName: string | undefined;
  let entryDomains: string[] = [];
  const entry = findEntryClass(files, manifestClassHint);
  if (entry) {
    notes.push(`Found entry subclass: ${entry.className}`);
    const superArgs = parseSuperCall(entry.src);
    if (superArgs) {
      // Convention: super(lang, name, domainEntries, hosterNames)
      if (superArgs.strings.length >= 2) {
        entryLang = superArgs.strings[0];
        entryName = superArgs.strings[1];
      }
      if (superArgs.lists.length >= 1) {
        entryDomains = superArgs.lists[0];
      }
    }
    if (entryName) notes.push(`Entry name (from super args): ${entryName}`);
    if (entryLang) notes.push(`Entry lang (from super args): ${entryLang}`);
    if (entryDomains.length)
      notes.push(`Entry domains: ${entryDomains.join(", ")}`);
  }

  // ---- Properties ----
  // Prefer entry-class values (real), fall back to source-class extraction.
  let baseUrl = extractBaseUrl(src);
  const lang = entryLang ?? extractProperty(src, "lang");
  const name = entryName ?? extractProperty(src, "name");
  const versionId = extractIntProperty(src, "versionId");
  const isNsfw = extractBoolProperty(src, "nsfw");

  // ---- Settings + fallback baseUrl ----
  // Use the decompiled-Java preference parser (setKey/setTitle method calls)
  // for the preference list, then run the Kotlin-style analyzer for fallback
  // baseUrl detection.
  const settings = analyzeSettingsDecompiled(src, entryDomains);
  notes.push(...settings.notes);
  if (!baseUrl && settings.fallbackBaseUrl) {
    baseUrl = settings.fallbackBaseUrl;
    notes.push(
      `baseUrl is preference-driven; using fallback "${baseUrl}" from settings.`,
    );
  }
  // Last-resort: scan for any https URL that looks like a site root.
  if (!baseUrl) {
    const urlRe = /"(https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^"'\s]*)"/gi;
    let um: RegExpExecArray | null;
    const candidates: string[] = [];
    while ((um = urlRe.exec(src)) !== null) {
      const u = um[1];
      // Skip asset/js/api-ish URLs; keep site roots.
      if (
        !/(\/ajax\/|\/api\/|\.js|\.css|\.png|\.jpg|github\.com|googleapis|jsdelivr)/.test(
          u,
        )
      ) {
        candidates.push(u);
      }
    }
    if (candidates.length) {
      baseUrl = candidates[0];
      notes.push(
        `baseUrl inferred from first site-root URL literal: "${baseUrl}".`,
      );
    }
  }

  // Method overrides (deduped — anime & manga share some method names)
  const allMethods = [...new Set([...ANIME_METHODS, ...MANGA_METHODS])];
  const methodOverrides = allMethods.filter((meth) =>
    new RegExp(`\\b${meth}\\s*\\(`).test(src),
  );
  notes.push(`Detected ${methodOverrides.length} overridden methods.`);

  // Selectors (ParsedHttpSource *Selector methods)
  const selectors: Record<string, string> = {};
  for (const meth of allMethods) {
    if (/Selector$/.test(meth)) {
      const body = extractMethodBody(src, meth);
      if (body) {
        const sel = extractSelectorReturn(body);
        if (sel) selectors[meth] = sel;
      }
    }
  }

  // Request URLs — prefer HttpUrl.Builder pattern (decompiled Java), fall back
  // to string-concatenation template (Kotlin source style).
  const requestUrls: Record<string, string[]> = {};
  const requestMethods = [
    "popularAnimeRequest",
    "latestUpdatesRequest",
    "searchAnimeRequest",
    "episodeListRequest",
    "videoListRequest",
    "popularMangaRequest",
    "searchMangaRequest",
    "chapterListRequest",
    "pageListRequest",
  ];
  for (const meth of requestMethods) {
    if (methodOverrides.includes(meth as never)) {
      const body = extractMethodBody(src, meth);
      if (body) {
        const builderTemplate = buildUrlFromBuilderPattern(body);
        if (builderTemplate) {
          requestUrls[meth] = [builderTemplate];
        } else {
          const { template, literals } = buildUrlTemplate(body, baseUrl);
          requestUrls[meth] = [template, ...literals];
        }
      }
    }
  }

  // FromElement selectors
  const fromElementSelectors: Record<string, string[]> = {};
  for (const meth of allMethods) {
    if (/FromElement$/.test(meth) && methodOverrides.includes(meth as never)) {
      const body = extractMethodBody(src, meth);
      if (body) {
        fromElementSelectors[meth] = extractJsoupSelectors(body);
      }
    }
  }

  // animeDetailsParse selectors — this method parses the Document directly with
  // selectFirst("...")/select("...") calls (not a FromElement method). Extract
  // them in order; convert.ts maps them to title/genre/status/etc.
  const detailsParseSelectors: string[] = [];
  const detailsBody = extractMethodBody(src, "animeDetailsParse");
  if (detailsBody) {
    detailsParseSelectors.push(...extractJsoupSelectors(detailsBody));
  }
  fromElementSelectors["animeDetailsParse"] = detailsParseSelectors;

  // Filters
  const filterBody = methodOverrides.includes("getFilterList" as never)
    ? extractMethodBody(src, "getFilterList")
    : null;
  const filters = detectFilters(filterBody);

  // All string literals across the class (for extractor + transparency)
  const allStrings = extractStrings(src);
  const detectedExtractors = detectExtractors(allStrings);

  // Group string literals per method (for rawAnalysis)
  const stringLiterals: { method: string; values: string[] }[] = [];
  for (const meth of methodOverrides) {
    const body = extractMethodBody(src, meth);
    if (body) {
      const vals = extractStrings(body);
      if (vals.length) stringLiterals.push({ method: meth, values: vals });
    }
  }

  notes.push(
    `Extracted ${Object.keys(selectors).length} selectors, ${Object.keys(
      requestUrls,
    ).length} request URLs, ${filters.length} filters, ${detectedExtractors.length} extractors.`,
  );

  return {
    sourceClassFile: relative(process.cwd(), chosen.file),
    sourceClassName: entry?.className ?? chosen.className,
    sourceType: chosen.baseType,
    candidateClasses: candidates.map((c) => c.className),
    methodOverrides,
    properties: { name, baseUrl, lang, versionId, isNsfw },
    selectors,
    requestUrls,
    fromElementSelectors,
    filters,
    detectedExtractors,
    stringLiterals,
    settings,
    notes,
  };
}

/**
 * Analyze settings using the decompiled-Java preference parser (setKey/setTitle
 * method calls) plus the Kotlin-style fallback for baseUrl/domains. The
 * `entryDomains` (from the entry subclass super() call) are injected into the
 * available domains + domain preference entries when the source uses
 * `this.c.toArray(...)` (field reference we can't statically resolve).
 */
function analyzeSettingsDecompiled(
  src: string,
  entryDomains: string[],
): SettingsAnalysis {
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

  // Run the Kotlin-style analyzer first (for PREF_* constants + fallback URLs).
  const base = analyzeSettings(src);

  // Parse the setupPreferenceScreen body with the decompiled-Java parser.
  const body = extractMethodBody(src, "setupPreferenceScreen");
  let prefs: {
    key: string;
    title: string;
    type: string;
    entries?: string[];
    entryValues?: string[];
    defaultValue?: string;
    isDomain?: boolean;
  }[] = [];
  if (body) {
    prefs = parsePreferenceScreen(body, src);
  }

  // Inject entryDomains into the domain preference (entries + entryValues)
  // when the source referenced `this.c.toArray(...)` and we couldn't resolve it.
  if (entryDomains.length > 0) {
    const domainPref = prefs.find((p) => p.isDomain);
    if (domainPref && (!domainPref.entries || domainPref.entries.length === 0)) {
      domainPref.entries = entryDomains;
      domainPref.entryValues = entryDomains.map((d) =>
        /^https?:\/\//.test(d) ? d : `https://${d}`,
      );
      notes.push(
        `Injected entry domains into "${domainPref.key}" preference.`,
      );
    }
  }

  // Merge: prefer decompiled prefs (richer), keep base for fallback URL detection.
  const entryDomainUrls = entryDomains.map((d) =>
    /^https?:\/\//.test(d) ? d : `https://${d}`,
  );
  const availableDomains = [
    ...(domainPrefEntryValues(prefs) ?? []),
    ...entryDomainUrls,
    ...base.availableDomains.filter(
      // Exclude mapper/API URLs that aren't site roots.
      (d) => !/\/api\/|mapper|nekostream/i.test(d),
    ),
  ];
  const dedupDomains = [...new Set(availableDomains)];
  // Prefer the first entry domain (the source's defaultBaseUrl = "https://" + first).
  // Fall back to base.fallbackBaseUrl only if no entry domains.
  const fallbackBaseUrl =
    entryDomainUrls[0] ?? base.fallbackBaseUrl ?? dedupDomains.find((d) => /^https?:\/\//.test(d));

  notes.push(
    `Decompiled preference parser found ${prefs.length} preference(s).`,
  );
  if (fallbackBaseUrl) {
    notes.push(`Fallback base URL: ${fallbackBaseUrl}`);
  }

  return {
    configurable: true,
    preferences: prefs.map((p) => ({
      key: p.key,
      title: p.title,
      type: p.type as SettingsAnalysis["preferences"][number]["type"],
      entries: p.entries,
      entryValues: p.entryValues,
      default: p.defaultValue,
      isDomainPreference: p.isDomain,
    })),
    domainPreferenceKeys: prefs
      .filter((p) => p.isDomain)
      .map((p) => p.key),
    availableDomains: dedupDomains,
    fallbackBaseUrl,
    notes,
  };
}

function domainPrefEntryValues(
  prefs: { isDomain?: boolean; entryValues?: string[] }[],
): string[] {
  const dp = prefs.find((p) => p.isDomain);
  return dp?.entryValues ?? [];
}

function emptyAnalysis(
  jadxOutDir: string,
  notes: string[],
  chosen?: { file: string; className: string; baseType: SourceType },
): SourceAnalysis {
  return {
    sourceClassFile: chosen
      ? relative(process.cwd(), chosen.file)
      : relative(process.cwd(), jadxOutDir),
    sourceClassName: chosen?.className ?? "Unknown",
    sourceType: chosen?.baseType ?? "Unknown",
    candidateClasses: [],
    methodOverrides: [],
    properties: {},
    selectors: {},
    requestUrls: {},
    fromElementSelectors: {},
    filters: [],
    detectedExtractors: [],
    stringLiterals: [],
    settings: {
      configurable: false,
      preferences: [],
      domainPreferenceKeys: [],
      availableDomains: [],
      notes: [],
    } as SettingsAnalysis,
    notes,
  };
}

/** Build capabilities from method overrides. */
export function buildCapabilities(
  analysis: SourceAnalysis,
  kind: "anime" | "manga",
): Capabilities {
  const has = (m: string) => analysis.methodOverrides.includes(m as never);
  return {
    sourceKind: kind,
    supportsLatest:
      kind === "anime"
        ? has("latestUpdatesRequest") || has("latestUpdatesParse")
        : has("latestUpdatesRequest") || has("latestUpdatesParse"),
    supportsSearch:
      kind === "anime"
        ? has("searchAnimeRequest") || has("searchAnimeParse")
        : has("searchMangaRequest") || has("searchMangaParse"),
    supportsFilters: has("getFilterList") && analysis.filters.length > 0,
    supportsEpisodes:
      kind === "anime"
        ? has("episodeListRequest") || has("episodeListParse")
        : has("chapterListRequest") || has("chapterListParse"),
    supportsVideos:
      kind === "anime"
        ? has("videoListRequest") || has("videoListParse") || has("videoUrlParse")
        : has("pageListRequest") || has("pageListParse"),
    supportsSubtitles:
      /subtitle/i.test(JSON.stringify(analysis.stringLiterals)) ||
      analysis.detectedExtractors.length > 0,
    supportsAudioTracks: /audio/i.test(JSON.stringify(analysis.stringLiterals)),
  };
}

export function buildRawAnalysis(
  analysis: SourceAnalysis,
  jadxOutDir: string,
  manifestDump: Record<string, unknown>,
  resourceStrings: Record<string, string>,
): RawAnalysis {
  return {
    decompiledPath: relative(process.cwd(), jadxOutDir),
    sourceClassFile: analysis.sourceClassFile,
    candidateClasses: analysis.candidateClasses,
    methodOverrides: analysis.methodOverrides,
    stringLiterals: analysis.stringLiterals.slice(0, 200), // cap for size
    manifestDump,
    resourceStrings: Object.fromEntries(
      Object.entries(resourceStrings).slice(0, 100),
    ),
    analyzerNotes: analysis.notes,
  };
}
