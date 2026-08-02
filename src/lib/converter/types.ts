/**
 * ============================================================================
 *  EXT-TO-JSON — Canonical Extension JSON Schema (v1.0.0)
 * ============================================================================
 *
 *  This file is the SINGLE SOURCE OF TRUTH for the JSON format produced by
 *  the converter and consumed by the playground. Every field is documented in
 *  docs/JSON_SCHEMA.md.
 *
 *  Design goals:
 *   - Faithful: capture every capability an Aniyomi/Animiru extension exposes.
 *   - Portable: pure JSON, no runtime dependency on the original APK.
 *   - Transparent: every extracted value carries a confidence + the raw
 *     analysis that produced it, so nothing is silently hidden.
 *   - Self-describing: a `health` block reports how complete the conversion is.
 *
 *  The format mirrors the Aniyomi `AnimeHttpSource` / `ParsedAnimeHttpSource`
 *  contract: meta -> browse (popular/latest/search) -> details -> episodes ->
 *  videos (servers/resolutions/formats) -> subtitles -> audio tracks.
 * ============================================================================
 */

export const SCHEMA_VERSION = "1.0.0" as const;
export const CONVERTER_VERSION = "1.0.0" as const;

/* -------------------------------------------------------------------------- */
/*  Top-level                                                                 */
/* -------------------------------------------------------------------------- */

export interface ExtensionJson {
  /** Schema version of THIS json file. */
  schemaVersion: string;
  /** Information about the converter run that produced this file. */
  converter: ConverterInfo;
  /** Core metadata about the extension. */
  meta: ExtensionMeta;
  /** Conversion health / completeness report. NEVER silently hidden. */
  health: HealthReport;
  /** What this extension can do (derived from overridden methods). */
  capabilities: Capabilities;
  /** Source-level configuration. */
  source: SourceConfig;
  /** Browse endpoints: popular, latest, search. */
  browse: BrowseConfig;
  /** Filter list (genres, sort, etc.). Empty array if none. */
  filters: FilterDef[];
  /** Anime details page parsing. */
  details: DetailsConfig;
  /** Episode list parsing. */
  episodes: EpisodesConfig;
  /** Video extraction: servers, resolutions, formats, extractor strategy. */
  videos: VideosConfig;
  /** Subtitle track handling. */
  subtitles: SubtitlesConfig;
  /** Multiple audio track handling. */
  audio: AudioConfig;
  /** User-configurable settings (preferences) extracted from the source. */
  settings: ExtensionSettings;
  /** Raw analysis dump for debugging / transparency. */
  rawAnalysis: RawAnalysis;
}

/* -------------------------------------------------------------------------- */
/*  Extension settings (preferences)                                          */
/* -------------------------------------------------------------------------- */

export type PreferenceType =
  | "list"
  | "text"
  | "switch"
  | "multiselect"
  | "unknown";

export interface PreferenceDef {
  /** Stable key used by the extension (e.g. "pref_domain_key"). */
  key: string;
  /** Human-readable title shown to the user. */
  title: string;
  /** Preference type. */
  type: PreferenceType;
  /** For list/multiselect: the option labels. */
  entries?: string[];
  /** For list/multiselect: the option values (parallel to entries). */
  entryValues?: string[];
  /** Default value. */
  default?: string | boolean | string[];
  /** Free-text note (e.g. "Controls which domain is used for requests"). */
  note?: string;
  /** True when this preference controls the base URL / domain. */
  isDomainPreference?: boolean;
}

export interface ExtensionSettings {
  /** Whether the source is configurable (implements ConfigurableAnimeSource). */
  configurable: boolean;
  /** Detected preferences. Empty array if none / not configurable. */
  preferences: PreferenceDef[];
  /** Keys of preferences that affect baseUrl (so the playground can swap). */
  domainPreferenceKeys: string[];
  /** Optional domains list detected from the source (for the domain picker). */
  availableDomains: string[];
}

/* -------------------------------------------------------------------------- */
/*  Converter info                                                            */
/* -------------------------------------------------------------------------- */

export interface ConverterInfo {
  version: string;
  convertedAt: string; // ISO 8601
  durationMs: number;
  toolchain: {
    apktool: string;
    jadx: string;
    java: string;
  };
  inputFile: string; // original apk filename
  inputSha256: string;
}

/* -------------------------------------------------------------------------- */
/*  Metadata                                                                  */
/* -------------------------------------------------------------------------- */

export interface ExtensionMeta {
  /** Display name, e.g. "Aniwatch". */
  name: string;
  /** ISO language code, e.g. "en", "ja", "all". */
  lang: string;
  /** Base site URL. */
  baseUrl: string;
  /** Aniyomi source version id (from manifest meta). */
  versionId: number;
  /** NSFW flag. */
  isNsfw: boolean;
  /** Android package name, e.g. eu.kanade.tachiyomi.animeextension.en.aniwatch */
  packageName: string;
  /** APK version code. */
  apkVersionCode: number;
  /** APK version name. */
  apkVersionName: string;
  /** The decompiled source class simple name. */
  sourceClassName: string;
  /** Base class the source extends. */
  sourceType: SourceType;
  /** Source icon as a data URL (optional). */
  iconDataUrl?: string;
}

export type SourceType =
  | "ParsedAnimeHttpSource"
  | "AnimeHttpSource"
  | "ParsedHttpSource"
  | "HttpSource"
  | "AnimeSource"
  | "Unknown";

/* -------------------------------------------------------------------------- */
/*  Health report                                                             */
/* -------------------------------------------------------------------------- */

export type HealthStatus = "healthy" | "warning" | "error";
export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface HealthReport {
  /** 0-100 completeness score. */
  score: number;
  status: HealthStatus;
  summary: string;
  checks: HealthCheck[];
  warnings: string[];
  errors: string[];
}

export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

/* -------------------------------------------------------------------------- */
/*  Capabilities                                                              */
/* -------------------------------------------------------------------------- */

export interface Capabilities {
  sourceKind: "anime" | "manga";
  supportsLatest: boolean;
  supportsSearch: boolean;
  supportsFilters: boolean;
  supportsEpisodes: boolean;
  supportsVideos: boolean;
  supportsSubtitles: boolean;
  supportsAudioTracks: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Source config                                                             */
/* -------------------------------------------------------------------------- */

export interface SourceConfig {
  baseUrl: string;
  lang: string;
  headers: Record<string, string>;
  /** User-agent hint if detected. */
  userAgent?: string;
  /** Requests per second hint (0 = unlimited). */
  rateLimitPerSecond: number;
}

/* -------------------------------------------------------------------------- */
/*  Browse                                                                    */
/* -------------------------------------------------------------------------- */

export interface BrowseConfig {
  popular: BrowseEndpoint;
  latest?: BrowseEndpoint;
  search: BrowseEndpoint;
}

export interface BrowseEndpoint {
  method: "GET" | "POST";
  /**
   * URL template. Placeholders:
   *   {page}   - 1-based page number
   *   {query}  - search term (URL-encoded)
   *   {filter:PARAM} - filter value
   */
  url: string;
  headers: Record<string, string>;
  body?: string;
  parse: ListParse;
  /** Whether pagination is supported. */
  paginated: boolean;
}

export interface ListParse {
  /** CSS selector for the repeating item container. */
  itemSelector: string;
  /** Per-item field selectors (JSoup CSS). */
  title: string;
  url: string;
  thumbnail: string;
  /** How to resolve the url field. */
  urlResolution: "href" | "text" | "attr" | "data-attr";
  /** Attribute used for url resolution when resolution != href/text. */
  urlAttr?: string;
  /** Attribute holding the thumbnail (e.g. src, data-src, data-original). */
  thumbnailAttr: string;
  /** Extra fields extracted per item. */
  extras: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/*  Filters                                                                   */
/* -------------------------------------------------------------------------- */

export type FilterType =
  | "header"
  | "separator"
  | "text"
  | "select"
  | "sort"
  | "checkbox"
  | "group";

export interface FilterDef {
  name: string;
  type: FilterType;
  /** Query param or path key the filter maps to. */
  param?: string;
  /** For select: ordered options. */
  values?: string[];
  /** For sort: name/value pairs. */
  sortValues?: { name: string; value: string }[];
  /** Default value. */
  default?: string | number | boolean;
  /** Nested filters for group type. */
  subFilters?: FilterDef[];
}

/* -------------------------------------------------------------------------- */
/*  Details                                                                   */
/* -------------------------------------------------------------------------- */

export interface DetailsConfig {
  title: string;
  description: string;
  thumbnail: string;
  author: string;
  artist: string;
  genre: string;
  status: string;
  /** Map raw status text to Aniyomi status enum. */
  statusMapping: {
    ongoing: string[];
    completed: string[];
    canceled: string[];
    onHiatus: string[];
  };
  extras: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/*  Episodes                                                                  */
/* -------------------------------------------------------------------------- */

export interface EpisodesConfig {
  method: "GET" | "POST";
  /** URL template. Placeholders: {animeUrl}, {animeId}, {page}. */
  url: string;
  headers: Record<string, string>;
  body?: string;
  parse: EpisodesParse;
  pagination?: {
    nextSelector: string;
    nextUrlTemplate: string;
  };
}

export interface EpisodesParse {
  itemSelector: string;
  number: string;
  name: string;
  url: string;
  scanlator: string;
  date: string;
  /** How the episode number is parsed from the matched text. */
  numberExtraction: "regex" | "float" | "index";
  numberRegex?: string;
}

/* -------------------------------------------------------------------------- */
/*  Videos                                                                    */
/* -------------------------------------------------------------------------- */

export interface VideosConfig {
  method: "GET" | "POST";
  /** URL template. Placeholders: {episodeUrl}, {episodeId}. */
  url: string;
  headers: Record<string, string>;
  /** Servers detected in the source. */
  servers: VideoServer[];
  /** All resolutions the source can offer (union across servers). */
  resolutions: string[];
  /** Container/stream formats: mp4, m3u8, mkv, ... */
  formats: string[];
  /** How the playground should resolve videos. */
  extractorStrategy: "registry" | "iframe-recursive" | "none";
  /** Extractor ids detected by name in the source. */
  detectedExtractors: string[];
}

export interface VideoServer {
  /** Display name, e.g. "Vidstream", "Mp4Upload". */
  name: string;
  /** CSS selector on the video page that locates this server's embed/iframe. */
  selector: string;
  /** Extractor id in the playground registry. "unsupported" if none. */
  extractor: string;
  /** Qualities offered by this server, if known. */
  qualities: string[];
  /** Free-text note (e.g. "iframe src attribute"). */
  note: string;
}

/* -------------------------------------------------------------------------- */
/*  Subtitles                                                                 */
/* -------------------------------------------------------------------------- */

export interface SubtitlesConfig {
  supported: boolean;
  /** How subtitle tracks are exposed. */
  source: "video-track" | "separate-request" | "none";
  /** Selector if separate-request. */
  selector?: string;
  /** Subtitle file formats the source provides. */
  formats: string[];
  /** Language label field name in the source. */
  languageLabel?: string;
  note: string;
}

/* -------------------------------------------------------------------------- */
/*  Audio                                                                     */
/* -------------------------------------------------------------------------- */

export interface AudioConfig {
  supported: boolean;
  source: "video-track" | "separate-request" | "none";
  tracks: AudioTrack[];
  note: string;
}

export interface AudioTrack {
  label: string;
  langCode?: string;
  url?: string;
}

/* -------------------------------------------------------------------------- */
/*  Raw analysis (transparency)                                               */
/* -------------------------------------------------------------------------- */

export interface RawAnalysis {
  /** Relative path of the decompiled tree inside the work dir. */
  decompiledPath: string;
  /** File path of the detected source class. */
  sourceClassFile: string;
  /** Candidate source classes considered. */
  candidateClasses: string[];
  /** Overridden method names found on the source class. */
  methodOverrides: string[];
  /** String literals grouped by the method that contains them. */
  stringLiterals: { method: string; values: string[] }[];
  /** Decoded AndroidManifest as a plain object. */
  manifestDump: Record<string, unknown>;
  /** Selected resource strings (app_name, source overrides, ...). */
  resourceStrings: Record<string, string>;
  /** Free-text notes from the analyzer, in order. */
  analyzerNotes: string[];
}

/* -------------------------------------------------------------------------- */
/*  Conversion job (used by API/db, not part of the on-disk json)             */
/* -------------------------------------------------------------------------- */

export type JobStatus =
  | "queued"
  | "unpacking"
  | "decoding-manifest"
  | "decompiling"
  | "analyzing"
  | "assembling"
  | "health-check"
  | "done"
  | "error";

export interface ConversionJob {
  id: string;
  status: JobStatus;
  progress: number; // 0-100
  message: string;
  apkFileName: string;
  startedAt: string;
  updatedAt: string;
  error?: string;
  extensionId?: string;
  logs: { ts: string; level: "info" | "warn" | "error"; message: string }[];
}
