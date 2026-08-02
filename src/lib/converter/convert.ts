/**
 * ============================================================================
 *  convert.ts — Orchestrates the full APK -> ExtensionJson conversion pipeline.
 * ============================================================================
 *
 *  Pipeline:
 *    1. resolve + verify toolchain (apktool, jadx, java)
 *    2. sha256 the apk
 *    3. unpack (apktool)  -> manifest + resources
 *    4. decompile (jadx)  -> java sources
 *    5. analyze source    -> SourceAnalysis
 *    6. assemble ExtensionJson (map analysis -> schema)
 *    7. compute health
 *
 *  `onProgress` is invoked at each stage so the API layer can stream status.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  resolveToolchain,
  verifyToolchain,
  detectToolchainVersions,
} from "./toolchain";
import { unpackApk } from "./unpack";
import { decompileApk } from "./decompile";
import { parseManifest, deriveFromPackage, slugToName } from "./manifest";
import { readResourceStrings, resolveStringRef } from "./resources";
import {
  analyzeSource,
  buildCapabilities,
  buildRawAnalysis,
  type SourceAnalysis,
} from "./analyze";
import { computeHealth } from "./health";
import {
  SCHEMA_VERSION,
  CONVERTER_VERSION,
  type ExtensionJson,
  type BrowseEndpoint,
  type VideoServer,
  type ListParse,
  type DetailsConfig,
} from "./types";

/** Map a detected extractor keyword to a playground registry id. */
export function extractorToRegistryId(name: string): string {
  const map: Record<string, string> = {
    vidstream: "vidstream",
    vidstreaming: "vidstream",
    gogo: "gogo",
    gogostream: "gogo",
    mp4upload: "mp4upload",
    doodstream: "doodstream",
    dood: "doodstream",
    streamtape: "streamtape",
    filemoon: "filemoon",
    kwik: "kwik",
    mixdrop: "mixdrop",
    streamlare: "streamlare",
    streamwish: "streamwish",
    fembed: "fembed",
    sendvid: "sendvid",
    streamsb: "streamsb",
    voe: "voe",
    yourupload: "yourupload",
    upstream: "upstream",
    zoro: "zoro",
    aniwatch: "aniwatch",
    kaido: "kaido",
    miruro: "miruro",
  };
  return map[name.toLowerCase()] ?? "unsupported";
}

export interface ConvertOptions {
  /** Keep the decompiled work directory after conversion (for debugging). */
  keepWorkDir?: boolean;
  /** Progress callback. */
  onProgress?: (stage: string, progress: number, message: string) => void;
}

export interface ConvertResult {
  json: ExtensionJson;
  workDir: string;
  durationMs: number;
}

export async function convertApk(
  apkPath: string,
  apkFileName: string,
  opts: ConvertOptions = {},
): Promise<ConvertResult> {
  const startedAt = Date.now();
  const { onProgress, keepWorkDir = true } = opts;
  const workDir = join(process.cwd(), "work", `job-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  const log = (stage: string, progress: number, message: string) =>
    onProgress?.(stage, progress, message);

  try {
    log("unpacking", 2, "Verifying toolchain (apktool, jadx, java)...");
    const tools = resolveToolchain();
    const versions = await verifyToolchain(tools);

    // sha256
    const apkBuf = readFileSync(apkPath);
    const inputSha256 = createHash("sha256").update(apkBuf).digest("hex");

    // 1. unpack
    log("unpacking", 8, "Decoding APK with apktool (manifest + resources)...");
    const unpacked = await unpackApk(apkPath, workDir, tools);

    // 2. manifest + resources
    log("decoding-manifest", 18, "Parsing AndroidManifest.xml...");
    const manifest = parseManifest(unpacked.manifestPath);
    const resourceStrings = readResourceStrings(unpacked.resDir);
    const manifestClassHint =
      manifest.metaData["tachiyomi.extension.class"] ||
      manifest.metaData["tachiyomi.animeextension.class"] ||
      undefined;
    const { lang: pkgLang, kind, slug } = deriveFromPackage(
      manifest.packageName,
    );

    // 3. decompile
    log("decompiling", 28, "Decompiling DEX with jadx...");
    const decompiled = await decompileApk(apkPath, workDir, tools);

    // 4. analyze
    log("analyzing", 55, "Analyzing decompiled source for Source class...");
    const analysis = analyzeSource(decompiled.outDir, manifestClassHint);
    const capabilities = buildCapabilities(analysis, kind);

    // 5. assemble
    log("assembling", 78, "Assembling ExtensionJson...");
    const json = assembleJson({
      apkFileName,
      inputSha256,
      versions,
      manifest,
      resourceStrings,
      pkgLang,
      slug,
      analysis,
      capabilities,
      decompiledPath: decompiled.outDir,
    });

    // 6. health
    log("health-check", 92, "Computing conversion health...");
    json.health = computeHealth({
      manifestParsed: !!manifest.packageName,
      sourceFound: analysis.sourceType !== "Unknown",
      analysis,
      capabilities,
      hasPopular: !!json.browse.popular.url || !!json.browse.popular.parse.itemSelector,
      hasSearch: !!json.browse.search.url || !!json.browse.search.parse.itemSelector,
      hasDetails: !!json.details.title,
      hasEpisodes: !!json.episodes.url || !!json.episodes.parse.itemSelector,
      hasVideos: !!json.videos.url || json.videos.servers.length > 0,
      serverCount: json.videos.servers.length,
    });

    log("done", 100, "Conversion complete.");
    const durationMs = Date.now() - startedAt;
    json.converter.durationMs = durationMs;

    return { json, workDir, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", 0, `Conversion failed: ${message}`);
    throw err;
  } finally {
    if (!keepWorkDir) {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Assembly (map SourceAnalysis -> ExtensionJson)                            */
/* -------------------------------------------------------------------------- */

interface AssembleInput {
  apkFileName: string;
  inputSha256: string;
  versions: { apktool: string; jadx: string; java: string };
  manifest: ReturnType<typeof parseManifest>;
  resourceStrings: Record<string, string>;
  pkgLang: string;
  slug: string;
  analysis: SourceAnalysis;
  capabilities: ReturnType<typeof buildCapabilities>;
  decompiledPath: string;
}

function assembleJson(input: AssembleInput): ExtensionJson {
  const {
    apkFileName,
    inputSha256,
    versions,
    manifest,
    resourceStrings,
    pkgLang,
    slug,
    analysis,
    capabilities,
    decompiledPath,
  } = input;

  const { properties } = analysis;

  // Name: source property -> app_name string -> slug
  const appNameRef = resolveStringRef(manifest.applicationLabel, resourceStrings);
  const name =
    properties.name ||
    appNameRef ||
    resourceStrings["app_name"] ||
    slugToName(slug);

  const baseUrl = properties.baseUrl ?? "";
  const lang = properties.lang ?? pkgLang ?? "en";
  const versionId = properties.versionId ?? 0;
  const isNsfw =
    properties.isNsfw ??
    (manifest.metaData["tachiyomi.extension.nsfw"] === "true" ||
      manifest.metaData["tachiyomi.animeextension.nsfw"] === "true" ||
      false);

  // Build browse endpoints
  const popular = buildBrowseEndpoint(
    analysis,
    "popularAnimeRequest",
    "popularAnimeSelector",
    "popularAnimeFromElement",
    "popularAnimeNextPageSelector",
    baseUrl,
    "/popular",
  );
  const latest = buildBrowseEndpoint(
    analysis,
    "latestUpdatesRequest",
    "latestUpdatesSelector",
    "latestUpdatesFromElement",
    "latestUpdatesNextPageSelector",
    baseUrl,
    "/latest",
  );
  const search = buildBrowseEndpoint(
    analysis,
    "searchAnimeRequest",
    "searchAnimeSelector",
    "searchAnimeFromElement",
    "searchAnimeNextPageSelector",
    baseUrl,
    "/search?q={query}",
  );

  // Details — map animeDetailsParse selectors by content (title/genre/status/...).
  const detailsSelectors =
    analysis.fromElementSelectors["animeDetailsParse"] ??
    analysis.fromElementSelectors["animeDetailsFromElement"] ??
    [];
  const details = buildDetailsConfig(detailsSelectors);

  // Episodes
  const epFromElement = analysis.fromElementSelectors["episodeFromElement"] ?? [];
  const episodes = {
    method: "GET" as const,
    url: analysis.requestUrls["episodeListRequest"]?.[0] ?? "{animeUrl}",
    headers: {} as Record<string, string>,
    parse: {
      itemSelector: analysis.selectors["episodeListSelector"] ?? "",
      number: epFromElement[0] ?? "a",
      name: epFromElement[1] ?? "",
      url: epFromElement[2] ?? "a",
      scanlator: epFromElement[3] ?? "",
      date: epFromElement[4] ?? "",
      numberExtraction: "regex" as const,
      numberRegex: "(\\d+(?:\\.\\d+)?)",
    },
    pagination: analysis.selectors["episodeNextPageSelector"]
      ? {
          nextSelector: analysis.selectors["episodeNextPageSelector"],
          nextUrlTemplate: "{baseUrl}{nextHref}",
        }
      : undefined,
  };

  // Videos
  const servers: VideoServer[] = analysis.detectedExtractors.map((name) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    selector: `iframe[src*="${name}"], a[data-server*="${name}"], li[data-video*="${name}"]`,
    extractor: extractorToRegistryId(name),
    qualities: [],
    note: `Detected by name in source string literals.`,
  }));
  const videos = {
    method: "GET" as const,
    url: analysis.requestUrls["videoListRequest"]?.[0] ?? "{episodeUrl}",
    headers: {} as Record<string, string>,
    servers,
    resolutions: dedupeResolutions(servers),
    formats: ["mp4", "m3u8"],
    extractorStrategy: servers.length > 0 ? ("registry" as const) : ("none" as const),
    detectedExtractors: analysis.detectedExtractors,
  };

  // Subtitles / audio
  const subtitleMention = analysis.stringLiterals.some((s) =>
    /subtitle|\.vtt|\.srt|\.ass/i.test(s.values.join(" ")),
  );
  const audioMention = analysis.stringLiterals.some((s) =>
    /audio|dub|track/i.test(s.values.join(" ")),
  );
  const subtitles = {
    supported: capabilities.supportsSubtitles,
    source: subtitleMention ? ("video-track" as const) : ("none" as const),
    formats: subtitleMention ? ["vtt", "srt"] : [],
    note: subtitleMention
      ? "Subtitle references detected in source; playground will surface any Video.subtitleTracks."
      : "No subtitle references detected.",
  };
  const audio = {
    supported: capabilities.supportsAudioTracks,
    source: audioMention ? ("video-track" as const) : ("none" as const),
    tracks: [],
    note: audioMention
      ? "Audio track references detected; playground will surface any Video.audioTracks."
      : "No multi-audio references detected.",
  };

  const rawAnalysis = buildRawAnalysis(
    analysis,
    decompiledPath,
    manifest.raw,
    resourceStrings,
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    converter: {
      version: CONVERTER_VERSION,
      convertedAt: new Date().toISOString(),
      durationMs: 0,
      toolchain: versions,
      inputFile: apkFileName,
      inputSha256,
    },
    meta: {
      name,
      lang,
      baseUrl,
      versionId,
      isNsfw,
      packageName: manifest.packageName,
      apkVersionCode: manifest.versionCode,
      apkVersionName: manifest.versionName,
      sourceClassName: analysis.sourceClassName,
      sourceType: analysis.sourceType,
    },
    health: {
      score: 0,
      status: "warning",
      summary: "pending",
      checks: [],
      warnings: [],
      errors: [],
    },
    capabilities,
    source: {
      baseUrl,
      lang,
      headers: { "User-Agent": defaultUserAgent() },
      rateLimitPerSecond: 0,
    },
    browse: { popular, latest, search },
    filters: analysis.filters.map((f) => ({
      name: f.name,
      type: f.type as never,
      values: f.values,
    })),
    details,
    episodes,
    videos,
    subtitles,
    audio,
    settings: {
      configurable: analysis.settings.configurable,
      preferences: analysis.settings.preferences,
      domainPreferenceKeys: analysis.settings.domainPreferenceKeys,
      availableDomains: analysis.settings.availableDomains,
    },
    rawAnalysis,
  };
}

function buildBrowseEndpoint(
  analysis: SourceAnalysis,
  requestMethod: string,
  selectorMethod: string,
  fromElementMethod: string,
  nextPageMethod: string,
  baseUrl: string,
  defaultPath: string,
): BrowseEndpoint {
  const url = analysis.requestUrls[requestMethod]?.[0] ?? baseUrl + defaultPath;
  const itemSelector =
    analysis.selectors[selectorMethod] ?? "";
  const fromEl = analysis.fromElementSelectors[fromElementMethod] ?? [];
  const parse: ListParse = {
    itemSelector,
    title: fromEl[0] ?? "",
    url: fromEl[1] ?? "a",
    thumbnail: fromEl[2] ?? "img",
    urlResolution: "href",
    thumbnailAttr: "src",
    extras: {},
  };
  return {
    method: "GET",
    url,
    headers: {},
    parse,
    paginated: !!analysis.selectors[nextPageMethod],
  };
}

function dedupeResolutions(servers: VideoServer[]): string[] {
  const set = new Set<string>();
  for (const s of servers) for (const q of s.qualities) set.add(q);
  return [...set];
}

/**
 * Build the DetailsConfig from the selectors extracted from animeDetailsParse.
 * Maps selectors by content keywords (title/genre/status/description/...) since
 * the order varies between sources.
 */
function buildDetailsConfig(selectors: string[]): DetailsConfig {
  const find = (re: RegExp) => selectors.find((s) => re.test(s)) ?? "";
  const title = find(/title|h1|h2/i) || selectors[0] || "";
  const genre = find(/genre/i);
  const status = find(/status|state/i);
  const description = find(/description|synopsis|summary/i);
  const author = find(/author/i);
  const artist = find(/artist|studio/i);
  const thumbnail = find(/img|thumbnail|poster|cover/i);
  return {
    title,
    description,
    thumbnail,
    author,
    artist,
    genre,
    status,
    statusMapping: {
      ongoing: ["ongoing", "ongoing?", "emission", "en cours", "ongoing anime"],
      completed: ["completed", "finish", "termine", "completed anime"],
      canceled: ["canceled", "cancelled"],
      onHiatus: ["hiatus", "on hold"],
    },
    extras: {},
  };
}

function defaultUserAgent(): string {
  return (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
}

/** Re-export detectToolchainVersions for the API info endpoint. */
export { detectToolchainVersions };
