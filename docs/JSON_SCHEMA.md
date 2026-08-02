# JSON Schema

> Source of truth: [`src/lib/converter/types.ts`](../src/lib/converter/types.ts).
>
> This document describes every field of the **`ExtensionJson`** document
> produced by the converter and consumed by the playground. Schema version
> **1.0.0**. If the schema evolves, `SCHEMA_VERSION` in `types.ts` bumps and
> this doc is updated.

The document models the Aniyomi / Animiru `AnimeHttpSource` /
`ParsedAnimeHttpSource` contract: a source has metadata, browse endpoints
(popular / latest / search), filterable lists, anime details, episode lists,
video servers, subtitles, and audio tracks. Every extracted value carries the
raw analysis that produced it (in `rawAnalysis`) so any decision can be
audited — nothing is silently hidden.

---

## Table of contents

- [Top-level: `ExtensionJson`](#top-level-extensionjson)
- [`converter` — `ConverterInfo`](#converter--converterinfo)
- [`meta` — `ExtensionMeta`](#meta--extensionmeta)
- [`health` — `HealthReport`](#health--healthreport)
- [`capabilities` — `Capabilities`](#capabilities--capabilities)
- [`source` — `SourceConfig`](#source--sourceconfig)
- [`browse` — `BrowseConfig`](#browse--browseconfig)
  - [`BrowseEndpoint`](#browseendpoint)
  - [`ListParse`](#listparse)
- [`filters` — `FilterDef[]`](#filters--filterdef)
- [`details` — `DetailsConfig`](#details--detailsconfig)
- [`episodes` — `EpisodesConfig`](#episodes--episodesconfig)
  - [`EpisodesParse`](#episodesparse)
- [`videos` — `VideosConfig`](#videos--videosconfig)
  - [`VideoServer`](#videoserver)
- [`subtitles` — `SubtitlesConfig`](#subtitles--subtitlesconfig)
- [`audio` — `AudioConfig`](#audio--audioconfig)
  - [`AudioTrack`](#audiotrack)
- [`settings` — `ExtensionSettings`](#settings--extensionsettings)
  - [`PreferenceDef`](#preferencedef)
- [`rawAnalysis` — `RawAnalysis`](#rawanalysis--rawanalysis)
- [URL template placeholders](#url-template-placeholders)
- [CSS selector semantics](#css-selector-semantics)
- [Health scoring](#health-scoring)
- [Full example document](#full-example-document)

---

## Top-level: `ExtensionJson`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `schemaVersion` | `string` | yes | Schema version of this JSON file. Currently `"1.0.0"`. |
| `converter` | [`ConverterInfo`](#converter--converterinfo) | yes | Information about the converter run that produced this file. |
| `meta` | [`ExtensionMeta`](#meta--extensionmeta) | yes | Core metadata about the extension (name, lang, baseUrl, package, source type, …). |
| `health` | [`HealthReport`](#health--healthreport) | yes | Conversion completeness report. Never silently hidden. |
| `capabilities` | [`Capabilities`](#capabilities--capabilities) | yes | What this extension can do (derived from overridden methods). |
| `source` | [`SourceConfig`](#source--sourceconfig) | yes | Source-level runtime configuration (baseUrl, headers, rate limit). |
| `browse` | [`BrowseConfig`](#browse--browseconfig) | yes | Popular / latest / search endpoints with their parse rules. |
| `filters` | [`FilterDef[]`](#filters--filterdef) | yes | Filter list (genres, sort, …). Empty array if none. |
| `details` | [`DetailsConfig`](#details--detailsconfig) | yes | Anime details page parsing. |
| `episodes` | [`EpisodesConfig`](#episodes--episodesconfig) | yes | Episode list parsing. |
| `videos` | [`VideosConfig`](#videos--videosconfig) | yes | Video extraction: servers, resolutions, formats, extractor strategy. |
| `subtitles` | [`SubtitlesConfig`](#subtitles--subtitlesconfig) | yes | Subtitle track handling. |
| `audio` | [`AudioConfig`](#audio--audioconfig) | yes | Multiple audio track handling. |
| `settings` | [`ExtensionSettings`](#settings--extensionsettings) | yes | User-configurable preferences (domain, quality, etc.) extracted from the source. |
| `rawAnalysis` | [`RawAnalysis`](#rawanalysis--rawanalysis) | yes | Raw analysis dump for debugging / transparency. |

---

## `converter` — `ConverterInfo`

Provenance for the conversion run. Useful for reproducibility and for telling
apart re-conversions of the same APK under different tool versions.

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `version` | `string` | Converter version (matches `CONVERTER_VERSION` in `types.ts`). | `"1.0.0"` |
| `convertedAt` | `string` (ISO 8601) | When the conversion finished. | `"2026-08-02T13:37:44.752Z"` |
| `durationMs` | `number` | Wall-clock time of the whole pipeline in milliseconds. | `7191` |
| `toolchain.apktool` | `string` | apktool version string (first line of `apktool --version`). | `"2.9.3"` |
| `toolchain.jadx` | `string` | jadx version string. | `"1.4.7"` |
| `toolchain.java` | `string` | java version string (first line of `java -version`). | `"openjdk version 21.0.11 2026-04-21"` |
| `inputFile` | `string` | Original APK filename as uploaded. | `"jellyfin.apk"` |
| `inputSha256` | `string` (hex) | SHA-256 of the uploaded APK bytes. | `"54e76891daf9…"` |

---

## `meta` — `ExtensionMeta`

Identity and basic facts about the extension.

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `name` | `string` | Display name. Resolution order: source `getName()`/`name` property → app_name resource string → slug-derived Title Case. | `"Aniyomi: Jellyfin"` |
| `lang` | `string` | ISO language code or `"all"`. From the source `lang` property, falling back to the package-name segment. | `"en"`, `"all"`, `"ja"` |
| `baseUrl` | `string` | Base site URL. From the source `baseUrl` property. **May be a placeholder string** for configurable sources (e.g. Jellyfin returns `"The server address"`); see [Limitations](#health-scoring). | `"https://aniwatch.to"` |
| `versionId` | `number` | Aniyomi source version id (from the manifest's `tachiyomi.animeextension.v` meta-data or the source's `versionId` property). `0` if not found. | `14` |
| `isNsfw` | `boolean` | NSFW flag. From `isNsfw()` getter, the `nsfw` field, or the `tachiyomi.animeextension.nsfw` manifest meta-data. | `false` |
| `packageName` | `string` | Android package name. The canonical identity of the extension. Used as the upsert key in the DB. | `"eu.kanade.tachiyomi.animeextension.en.aniwatch"` |
| `apkVersionCode` | `number` | APK `versionCode` from the manifest. `0` if missing. | `14` |
| `apkVersionName` | `string` | APK `versionName` from the manifest. | `"1.4.0"` |
| `sourceClassName` | `string` | Simple name of the decompiled source class. | `"Jellyfin"` |
| `sourceType` | [`SourceType`](#sourcetype) | Base class the source extends. | `"AnimeHttpSource"` |
| `iconDataUrl?` | `string` | Optional source icon as a `data:` URL. Currently not extracted. | `undefined` |

### `SourceType`

```ts
type SourceType =
  | "ParsedAnimeHttpSource"   // ParsedHttpSource + anime: selectors overridden
  | "AnimeHttpSource"         // HTTP-only anime source (custom parse logic)
  | "ParsedHttpSource"        // ParsedHttpSource for manga
  | "HttpSource"              // HTTP-only manga source
  | "AnimeSource"             // generic anime source (rare)
  | "Unknown";                // no recognized base class was found
```

---

## `health` — `HealthReport`

A transparent conversion completeness report. Surfaced in the UI as a badge +
expandable list of checks.

| Field | Type | Meaning |
| --- | --- | --- |
| `score` | `number` (0–100) | Percentage of non-skipped checks that passed. |
| `status` | `"healthy" \| "warning" \| "error"` | Roll-up: `error` if any critical check failed or score < 40; `warning` if any non-critical check failed or score < 80; otherwise `healthy`. |
| `summary` | `string` | Human-readable one-liner. | 
| `checks` | [`HealthCheck[]`](#healthcheck) | Per-check details. |
| `warnings` | `string[]` | Labels + details of non-critical failures. |
| `errors` | `string[]` | Labels + details of critical failures (manifest, source-class, base-url, method-overrides). |

### `HealthCheck`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable id: `manifest`, `source-class`, `base-url`, `language`, `name`, `method-overrides`, `browse-popular`, `browse-search`, `details`, `episodes`, `videos`, `servers`, `filters`. |
| `label` | `string` | Human label, e.g. `"Source class located"`. |
| `status` | `"pass" \| "warn" \| "fail" \| "skip"` | Outcome. `skip` for non-applicable checks (e.g. `servers` on a manga source). |
| `detail` | `string` | What was found (or not). |

### Health scoring

The 13 checks (in order):

1. **manifest** — critical. Did apktool produce a readable manifest?
2. **source-class** — critical. Did the analyzer find a class extending a known base?
3. **base-url** — critical. Was a `baseUrl` property extracted?
4. **language** — was a `lang` extracted?
5. **name** — was a display name extracted (falls back to slug if not)?
6. **method-overrides** — critical. > 0 overridden methods?
7. **browse-popular** — `popularAnimeRequest` + `popularAnimeSelector` present?
8. **browse-search** — `searchAnimeRequest` present?
9. **details** — `animeDetailsParse` / `animeDetailsFromElement` present?
10. **episodes** — `episodeListParse` present? (skipped for manga)
11. **videos** — `videoListParse` / `videoUrlParse` present? (skipped for manga)
12. **servers** — ≥ 1 known video server detected? (skipped for manga)
13. **filters** — `getFilterList` overridden with > 0 filters? (skipped if no filters)

Score = `passCount / (totalCount - skipCount) * 100`. Critical failures
(`manifest`, `source-class`, `base-url`, `method-overrides`) go to `errors`;
all other failures go to `warnings`.

---

## `capabilities` — `Capabilities`

Derived from the set of overridden methods on the source class.

| Field | Type | Derived from | Example |
| --- | --- | --- | --- |
| `sourceKind` | `"anime" \| "manga"` | Whether the package name contains `animeextension` or `extension`. | `"anime"` |
| `supportsLatest` | `boolean` | `latestUpdatesRequest` or `latestUpdatesParse` overridden. | `true` |
| `supportsSearch` | `boolean` | `searchAnimeRequest` / `searchAnimeParse` (anime) or `searchMangaRequest` / `searchMangaParse` (manga). | `true` |
| `supportsFilters` | `boolean` | `getFilterList` overridden **and** at least one filter detected. | `false` |
| `supportsEpisodes` | `boolean` | `episodeListRequest` / `episodeListParse` (anime) or `chapterListRequest` / `chapterListParse` (manga). | `true` |
| `supportsVideos` | `boolean` | `videoListRequest` / `videoListParse` / `videoUrlParse` (anime) or `pageListRequest` / `pageListParse` (manga). | `true` |
| `supportsSubtitles` | `boolean` | Any string literal mentions "subtitle" / `.vtt` / `.srt` / `.ass`, **or** ≥ 1 video server detected. | `true` |
| `supportsAudioTracks` | `boolean` | Any string literal mentions "audio" / "dub" / "track". | `true` |

---

## `source` — `SourceConfig`

Runtime configuration the playground uses when fetching pages.

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `baseUrl` | `string` | Same as `meta.baseUrl`. Duplicated here so the playground only needs `source`. | `"https://aniwatch.to"` |
| `lang` | `string` | Same as `meta.lang`. | `"en"` |
| `headers` | `Record<string, string>` | Extra HTTP headers. Always includes a default desktop User-Agent. | `{ "User-Agent": "Mozilla/5.0 …" }` |
| `userAgent?` | `string` | Convenience accessor for the UA. | `"Mozilla/5.0 …"` |
| `rateLimitPerSecond` | `number` | Requests per second hint. `0` = unlimited. Currently always `0`. | `0` |

---

## `browse` — `BrowseConfig`

| Field | Type | Meaning |
| --- | --- | --- |
| `browse.popular` | [`BrowseEndpoint`](#browseendpoint) | Popular-anime listing. Always present (URL may be a best-effort template). |
| `browse.latest?` | [`BrowseEndpoint`](#browseendpoint) | Latest-updates listing. Omitted if the source doesn't support latest. |
| `browse.search` | [`BrowseEndpoint`](#browseendpoint) | Search listing. Always present. |

### `BrowseEndpoint`

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `method` | `"GET" \| "POST"` | HTTP method for the request. Currently always `"GET"`. | `"GET"` |
| `url` | `string` | URL template. See [placeholders](#url-template-placeholders). | `"https://aniwatch.to/popular?page={page}"` |
| `headers` | `Record<string, string>` | Per-endpoint headers (usually empty). | `{}` |
| `body?` | `string` | Request body for `POST`. | `undefined` |
| `parse` | [`ListParse`](#listparse) | Selectors for parsing the response HTML. | see below |
| `paginated` | `boolean` | Whether pagination is supported (i.e. a `*NextPageSelector` was overridden). | `true` |

### `ListParse`

All selectors are JSoup-compatible CSS (see [selector semantics](#css-selector-semantics)).

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `itemSelector` | `string` | CSS selector for the repeating item container. Matches N elements on the page. | `"div.flw-item"` |
| `title` | `string` | Per-item selector for the title text. | `".dynamic-name"` |
| `url` | `string` | Per-item selector for the item URL. | `"a"` |
| `thumbnail` | `string` | Per-item selector for the thumbnail. | `"img"` |
| `urlResolution` | `"href" \| "text" \| "attr" \| "data-attr"` | How to read the URL field. | `"href"` |
| `urlAttr?` | `string` | Attribute name when `urlResolution === "attr"` or `"data-attr"`. | `"data-url"` |
| `thumbnailAttr` | `string` | Attribute holding the thumbnail URL. Common values: `src`, `data-src`, `data-original`. | `"data-src"` |
| `extras` | `Record<string, string>` | Extra per-item field selectors (currently empty). | `{}` |

---

## `filters` — `FilterDef[]`

Detected from `getFilterList()` method body. Each entry corresponds to a
`new XxxFilter("name", …)` constructor call.

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `name` | `string` | Filter display name (first string literal of the constructor). | `"Genre"` |
| `type` | [`FilterType`](#filtertype) | Filter kind, inferred from the constructor class name. | `"select"` |
| `param?` | `string` | Query param or path key the filter maps to. Currently not extracted. | `undefined` |
| `values?` | `string[]` | For `select`: ordered option labels. Currently not extracted. | `undefined` |
| `sortValues?` | `{ name: string; value: string }[]` | For `sort`: name/value pairs. Currently not extracted. | `undefined` |
| `default?` | `string \| number \| boolean` | Default value. Currently not extracted. | `undefined` |
| `subFilters?` | `FilterDef[]` | Nested filters for `group` type. Currently not extracted. | `undefined` |

### `FilterType`

```ts
type FilterType =
  | "header"     // Header("...")
  | "separator"  // Separator()
  | "text"       // TextFilter("...", ...)
  | "select"     // SelectFilter / CategoryFilter / GenreFilter
  | "sort"       // SortFilter
  | "checkbox"   // CheckboxFilter / CheckFilter
  | "group";     // GroupFilter (nested)
```

---

## `details` — `DetailsConfig`

Selectors for the anime details page. Each field is a CSS selector applied via
cheerio's `$(sel).first().text()` (or `.attr(name)` for `thumbnail`).

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `title` | `string` | Selector for the anime title. | `"h1.title"` |
| `description` | `string` | Selector for the synopsis. | `".description"` |
| `thumbnail` | `string` | Selector for the cover image. | `"img.cover"` |
| `author` | `string` | Selector for the author. | `".author"` |
| `artist` | `string` | Selector for the artist. | `".artist"` |
| `genre` | `string` | Selector for the genre list. | `".genres"` |
| `status` | `string` | Selector for the ongoing/completed status text. | `".status"` |
| `statusMapping` | `object` | Maps raw status text to Aniyomi enum values. | see below |
| `statusMapping.ongoing` | `string[]` | Substrings that mean `ONGOING`. | `["ongoing", "emission", "en cours"]` |
| `statusMapping.completed` | `string[]` | Substrings that mean `COMPLETED`. | `["completed", "finish", "termine"]` |
| `statusMapping.canceled` | `string[]` | Substrings that mean `CANCELED`. | `["canceled", "cancelled"]` |
| `statusMapping.onHiatus` | `string[]` | Substrings that mean `ON_HIATUS`. | `["hiatus", "on hold"]` |
| `extras` | `Record<string, string>` | Extra detail selectors. Currently empty. | `{}` |

The playground lowercases the matched status text and checks each array with
substring matching. If nothing matches, the raw text (or `"UNKNOWN"`) is
returned.

---

## `episodes` — `EpisodesConfig`

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `method` | `"GET" \| "POST"` | HTTP method. Currently always `"GET"`. | `"GET"` |
| `url` | `string` | URL template. Placeholders: `{animeUrl}`, `{animeId}`, `{page}`. If the template is missing, the playground falls back to fetching `{animeUrl}` directly. | `"{animeUrl}/episodes"` |
| `headers` | `Record<string, string>` | Per-endpoint headers. | `{}` |
| `body?` | `string` | Request body for `POST`. | `undefined` |
| `parse` | [`EpisodesParse`](#episodesparse) | Episode selectors. | see below |
| `pagination?` | `{ nextSelector, nextUrlTemplate }` | Optional next-page handling. `nextSelector` is a CSS selector whose `href` is the next page URL; `nextUrlTemplate` is a URL template where `{nextHref}` is replaced. | see below |

### `EpisodesParse`

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `itemSelector` | `string` | CSS selector for the repeating episode row. | `".episodes a"` |
| `number` | `string` | Per-item selector for the episode number text. | `".ep-num"` |
| `name` | `string` | Per-item selector for the episode name. | `".ep-name"` |
| `url` | `string` | Per-item selector for the episode URL. | `"a"` |
| `scanlator` | `string` | Per-item selector for the scanlator. | `""` |
| `date` | `string` | Per-item selector for the upload date. | `".date"` |
| `numberExtraction` | `"regex" \| "float" \| "index"` | How to derive the episode number from the matched text. | `"regex"` |
| `numberRegex?` | `string` | JS regex (string form) used when `numberExtraction === "regex"`. The first capture group is parsed as a float. | `"\\d+(?:\\.\\d+)?"` |

If `numberExtraction` is `"index"`, the episode number is the 1-based index of
the matched item. If `"regex"` and the regex doesn't match, the playground
falls back to the first `(\d+(?:\.\d+)?)` in the text. If `"float"`, the text
is parsed with `parseFloat()`.

---

## `videos` — `VideosConfig`

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `method` | `"GET" \| "POST"` | HTTP method. Currently always `"GET"`. | `"GET"` |
| `url` | `string` | URL template. Placeholders: `{episodeUrl}`, `{episodeId}`. If the template equals `"{episodeUrl}"`, the playground fetches the episode URL directly. | `"{episodeUrl}"` |
| `headers` | `Record<string, string>` | Per-endpoint headers. | `{}` |
| `servers` | [`VideoServer[]`](#videoserver) | Detected video servers. May be empty (the playground will then run the generic scanner on the page). | see below |
| `resolutions` | `string[]` | Union of qualities offered by all servers. May be empty if no per-quality info was extracted. | `["1080p", "720p"]` |
| `formats` | `string[]` | Container/stream formats the source can produce. Currently always `["mp4", "m3u8"]`. | `["mp4", "m3u8"]` |
| `extractorStrategy` | `"registry" \| "iframe-recursive" \| "none"` | How the playground should resolve videos. `"registry"` if any servers were detected; `"none"` otherwise. | `"registry"` |
| `detectedExtractors` | `string[]` | Extractor ids found by name in source string literals (e.g. `vidstream`, `mp4upload`). | `["vidstream", "mp4upload"]` |

### `VideoServer`

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `name` | `string` | Display name (capitalized). | `"Vidstream"` |
| `selector` | `string` | CSS selector on the video page that locates this server's embed/iframe. The playground reads `src`, `data-src`, `href`, or `data-video` from the matched element. | `"iframe[src*=\"vidstream\"]"` |
| `extractor` | `string` | Extractor id in the playground registry. `"unsupported"` if no extractor is registered for this server name. | `"vidstream"` |
| `qualities` | `string[]` | Qualities offered by this server, if known. Currently always empty (the playground discovers them at runtime). | `[]` |
| `note` | `string` | Free-text note. | `"Detected by name in source string literals."` |

The extractor id is derived from the server name via a fixed map in
`src/lib/converter/convert.ts::extractorToRegistryId`. Known mappings:
`vidstream`/`vidstreaming` → `vidstream`; `gogo`/`gogostream` → `gogo`;
`mp4upload` → `mp4upload`; `doodstream`/`dood` → `doodstream`; `streamtape`
→ `streamtape`; `filemoon` → `filemoon`; `kwik` → `kwik`; `mixdrop` →
`mixdrop`; `streamlare` → `streamlare`; `streamwish` → `streamwish`; `fembed`
→ `fembed`; `sendvid` → `sendvid`; `streamsb` → `streamsb`; `voe` → `voe`;
`yourupload` → `yourupload`; `upstream` → `upstream`; `zoro` → `zoro`;
`aniwatch` → `aniwatch`; `kaido` → `kaido`; `miruro` → `miruro`. Any other
name → `"unsupported"`.

---

## `subtitles` — `SubtitlesConfig`

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `supported` | `boolean` | Whether subtitles are supported (mirrors `capabilities.supportsSubtitles`). | `true` |
| `source` | `"video-track" \| "separate-request" \| "none"` | How subtitle tracks are exposed. `"video-track"` = embedded in the video element / m3u8 manifest; `"separate-request"` = a separate fetch; `"none"` = no subtitles. | `"video-track"` |
| `selector?` | `string` | CSS selector for subtitle URLs when `source === "separate-request"`. | `undefined` |
| `formats` | `string[]` | Subtitle file formats the source provides. Currently `["vtt", "srt"]` if any subtitle reference was detected, otherwise `[]`. | `["vtt", "srt"]` |
| `languageLabel?` | `string` | Field name in the source carrying the language label. Currently not extracted. | `undefined` |
| `note` | `string` | Free-text explanation. | `"Subtitle references detected in source; playground will surface any Video.subtitleTracks."` |

The playground scans each fetched video page for `<track kind="subtitles"
src="…" srclang="…" label="…">` elements and surfaces them as
`ExtractedVideo.subtitleTracks`. `.srt` files are converted to WebVTT
client-side before playback.

---

## `audio` — `AudioConfig`

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `supported` | `boolean` | Whether multi-audio is supported. | `true` |
| `source` | `"video-track" \| "separate-request" \| "none"` | How audio tracks are exposed. `"video-track"` = embedded in the m3u8 manifest (HLS `EXT-X-MEDIA`); `"separate-request"` = a separate fetch; `"none"` = no multi-audio. | `"video-track"` |
| `tracks` | [`AudioTrack[]`](#audiotrack) | Known audio tracks. Currently always empty (the playground discovers them at runtime from the m3u8 manifest or video element). | `[]` |
| `note` | `string` | Free-text explanation. | `"Audio track references detected; playground will surface any Video.audioTracks."` |

### `AudioTrack`

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `label` | `string` | Human-readable label. | `"English"` |
| `langCode?` | `string` | ISO 639-1 language code. | `"en"` |
| `url?` | `string` | Separate audio URL (when `source === "separate-request"`). | `undefined` |

> **HTML5 limitation.** The native `<video>` element cannot switch audio
> tracks for separate URLs. The playground surfaces the available tracks but
> only the in-manifest (HLS `EXT-X-MEDIA`) tracks can actually be selected
> during playback. This is a documented limitation, not a bug.

---

## `settings` — `ExtensionSettings`

User-configurable preferences extracted from the decompiled source. Extensions
that implement `ConfigurableAnimeSource` override `setupPreferenceScreen` and
add `ListPreference` / `EditTextPreference` / `SwitchPreference` entries, each
backed by `PREF_*_KEY` / `PREF_*_TITLE` / `PREF_*_DEFAULT` / `PREF_*_ENTRIES`
constants in a companion object.

The converter parses these and the playground exposes a Settings dialog so the
user can change them (e.g. swap the active domain). Saved values are persisted
to `converted/<id>.settings.json` and applied to every playground fetch via the
effective-source loader.

| Field | Type | Required | Description |
|---|---|---|---|
| `configurable` | `boolean` | yes | `true` when the source implements `ConfigurableAnimeSource` / has `setupPreferenceScreen`. |
| `preferences` | [`PreferenceDef[]`](#preferencedef) | yes | Detected preferences. Empty array if none. |
| `domainPreferenceKeys` | `string[]` | yes | Keys of preferences that control the base URL (so the playground can swap it). |
| `availableDomains` | `string[]` | yes | Domains detected from the source (for the domain picker). May be full URLs or bare hostnames. |

### `PreferenceDef`

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | yes | Stable preference key (e.g. `pref_domain_key`). |
| `title` | `string` | yes | Human-readable title shown to the user. |
| `type` | `"list" \| "text" \| "switch" \| "multiselect" \| "unknown"` | yes | Preference type. |
| `entries` | `string[]?` | no | For `list`/`multiselect`: the option labels. |
| `entryValues` | `string[]?` | no | For `list`/`multiselect`: the option values (parallel to `entries`). For domain preferences without explicit values, these are synthesized as `https://<entry>`. |
| `default` | `string \| boolean \| string[]?` | no | Default value. |
| `note` | `string?` | no | Free-text note. |
| `isDomainPreference` | `boolean?` | no | `true` when this preference controls the base URL / domain. |

Example:

```json
"settings": {
  "configurable": true,
  "preferences": [
    {
      "key": "preferred_quality",
      "title": "Preferred quality",
      "type": "list",
      "entries": ["1080p", "720p", "480p", "360p", "240p"],
      "entryValues": ["1080p", "720p", "480p", "360p", "240p"],
      "default": "720p",
      "isDomainPreference": false
    },
    {
      "key": "pref_domain_key",
      "title": "Preferred domain",
      "type": "list",
      "entries": ["animeblkom.net", "animeblkom.tv", "blkom.com"],
      "entryValues": ["https://animeblkom.net", "https://animeblkom.tv", "https://blkom.com"],
      "default": "https://animeblkom.net",
      "isDomainPreference": true
    }
  ],
  "domainPreferenceKeys": ["pref_domain_key"],
  "availableDomains": ["https://animeblkom.net", "https://animeblkom.tv", "https://blkom.com"]
}
```

---

## `rawAnalysis` — `RawAnalysis`

The transparency dump. Preserved verbatim so any converter decision can be
audited.

| Field | Type | Meaning | Example |
| --- | --- | --- | --- |
| `decompiledPath` | `string` | Relative path of the jadx output tree inside `work/`. | `"work/job-1785677857561/jadx-out"` |
| `sourceClassFile` | `string` | Relative path of the detected source class file. | `"work/job-1785677857561/jadx-out/sources/eu/kanade/tachiyomi/animeextension/all/jellyfin/Jellyfin.java"` |
| `candidateClasses` | `string[]` | Simple names of all classes that extended a known Aniyomi base, sorted by score (overrides count). | `["Jellyfin"]` |
| `methodOverrides` | `string[]` | Deduped list of overridden methods found on the chosen source class. | `["popularAnimeRequest", "popularAnimeParse", …]` |
| `stringLiterals` | `{ method: string; values: string[] }[]` | String literals grouped by the method that contains them. Capped at 200 entries to keep file size reasonable. | `[{ method: "popularAnimeRequest", values: ["/Users/", "/Items", …] }]` |
| `manifestDump` | `Record<string, unknown>` | Selected decoded manifest fields: `packageName`, `versionCode`, `versionName`, `metaDataKeys`. | see example |
| `resourceStrings` | `Record<string, string>` | Up to 100 decoded `<string>` entries from `res/values/strings.xml`. | `{ "app_name": "Aniyomi: Jellyfin" }` |
| `analyzerNotes` | `string[]` | Free-text notes from the analyzer, in order. Explains which candidate was chosen, why, and what was extracted. | `["Scanned 365 .java files from jadx output.", …]` |

---

## URL template placeholders

The following placeholders may appear in `browse.*.url`, `episodes.url`, and
`videos.url`:

| Placeholder | Meaning | Where it's used |
| --- | --- | --- |
| `{page}` | 1-based page number. URL-encoded. | browse popular / latest / search |
| `{query}` | Search term. URL-encoded by the playground. | browse search |
| `{animeUrl}` | The full URL of an anime's details page. | episodes |
| `{animeId}` | The source's internal anime id (best-effort). | episodes (rare) |
| `{episodeUrl}` | The full URL of an episode's page. | videos |
| `{episodeId}` | The source's internal episode id (best-effort). | videos (rare) |
| `{filter:PARAM}` | The value of filter `PARAM`. URL-encoded. | browse search |
| `{baseUrl}` | The source's `baseUrl`. Used in `episodes.pagination.nextUrlTemplate`. | episodes pagination |

If a URL template starts with `/` or doesn't start with `http`, the
playground prepends `source.baseUrl` (after stripping a trailing slash).
URLs that already start with `http(s)://` are used verbatim.

---

## CSS selector semantics

All selectors in the JSON are **JSoup-compatible CSS selectors**, the same
dialect the original Aniyomi extension uses. The playground applies them via
**cheerio** (a server-side jQuery-equivalent), which implements the same
selector grammar with a few notes:

- **Descendant selectors** work as expected: `.list .item a` matches `<a>`
  inside `.item` inside `.list`.
- **`tag` selectors** match the tag name (case-insensitive).
- **`.class` and `#id`** selectors work as in jQuery.
- **`[attr=value]`** attribute selectors work, including `[attr^=value]`,
  `[attr$=value]`, `[attr*=value]`.
- **`:first-child`, `:last-child`, `:nth-child(n)`** work.
- **`:has(...)`** is supported by cheerio (used by some extensions).
- **`abs:href`** (a JSoup-ism) is **not** supported by cheerio; the playground
  resolves relative URLs itself using `source.baseUrl`. The converter does not
  emit `abs:` selectors.

When applied via `ListParse` / `EpisodesParse`, the playground first calls
`$el.find(selector)` (descendant search within the item element); if that
matches nothing and `$el.is(selector)` is true, the item element itself is
used. This mirrors how Aniyomi's `Element.select()` / `Element.is()` work.

For `url` fields with `urlResolution === "href"` (or when the selector is
`"a"`), the playground reads the `href` attribute. For `thumbnailAttr`, it
reads that attribute from the matched element.

---

## Health scoring

See the [`health` section](#health--healthreport) above for the check list.
Critical checks (any failure → `errors[]`, score < 40 → `status: "error"`):

- `manifest`
- `source-class`
- `base-url`
- `method-overrides`

All other checks are non-critical (any failure → `warnings[]`, score 40–79 →
`status: "warning"`). A score ≥ 80 with no failures → `status: "healthy"`.

### Known limitations

The converter is heuristic and **honestly reports its limits**:

- **Configurable sources** with a lazy `baseUrl` (e.g. Jellyfin: `"The server
  address"`) — the `base-url` check may *pass* (the property is found) but the
  extracted value is not a real URL. The playground will fail at fetch time
  and surface the error explicitly.
- **Anti-bot video extractors** — the playground's named extractors are
  best-effort regex scans of the page HTML. Real Aniyomi extractors often need
  API keys, signed requests, or anti-bot solving (Cloudflare, etc.) that this
  playground does not implement. When no videos are found, the per-server
  `notes` say so explicitly — they never silently return zero videos.
- **Method-bodies decompiled imperfectly** — jadx may produce goto labels or
  syntactically odd Java; the analyzer's brace-matching for method bodies can
  occasionally include or exclude too much. The `rawAnalysis.stringLiterals`
  dump lets you audit what was actually scanned.

---

## Full example document

Abridged from a real Jellyfin conversion (see `test-apks/jellyfin.json` for
the full file):

```jsonc
{
  "schemaVersion": "1.0.0",
  "converter": {
    "version": "1.0.0",
    "convertedAt": "2026-08-02T13:37:44.752Z",
    "durationMs": 7191,
    "toolchain": {
      "apktool": "2.9.3",
      "jadx": "1.4.7",
      "java": "openjdk version 21.0.11 2026-04-21"
    },
    "inputFile": "jellyfin.apk",
    "inputSha256": "54e76891daf987e53f671fd86a4ce2a409666e38b5b81b30dee2973f7520085e"
  },
  "meta": {
    "name": "Aniyomi: Jellyfin",
    "lang": "all",
    "baseUrl": "The server address",
    "versionId": 0,
    "isNsfw": false,
    "packageName": "eu.kanade.tachiyomi.animeextension.all.jellyfin",
    "apkVersionCode": 0,
    "apkVersionName": "",
    "sourceClassName": "Jellyfin",
    "sourceType": "AnimeHttpSource"
  },
  "health": {
    "score": 75,
    "status": "warning",
    "summary": "Conversion incomplete — 75% complete. 3 warning(s), 0 error(s).",
    "checks": [
      { "id": "manifest",         "label": "AndroidManifest parsed", "status": "pass", "detail": "Package name, version code/name and meta-data extracted." },
      { "id": "source-class",     "label": "Source class located",   "status": "pass", "detail": "Jellyfin extends AnimeHttpSource." },
      { "id": "base-url",         "label": "Base URL extracted",     "status": "pass", "detail": "The server address" },
      { "id": "language",         "label": "Language extracted",     "status": "pass", "detail": "all" },
      { "id": "name",             "label": "Display name extracted", "status": "fail", "detail": "name not found in source; falling back to package slug / app_name." },
      { "id": "method-overrides", "label": "Method overrides detected", "status": "pass", "detail": "11 overridden methods detected." },
      { "id": "browse-popular",   "label": "Popular endpoint",      "status": "pass", "detail": "popularAnimeRequest + popularAnimeSelector present." },
      { "id": "browse-search",    "label": "Search endpoint",       "status": "pass", "detail": "searchAnimeRequest present." },
      { "id": "details",          "label": "Anime details parsing", "status": "fail", "detail": "Details parsing missing." },
      { "id": "episodes",         "label": "Episode list parsing",  "status": "pass", "detail": "episodeListParse present." },
      { "id": "videos",           "label": "Video extraction",      "status": "pass", "detail": "videoListParse / videoUrlParse present." },
      { "id": "servers",          "label": "Video servers detected", "status": "fail", "detail": "No known video server names detected in source string literals." },
      { "id": "filters",          "label": "Filter list",           "status": "skip", "detail": "No filters." }
    ],
    "warnings": [
      "Display name extracted: name not found in source; falling back to package slug / app_name.",
      "Anime details parsing: Details parsing missing.",
      "Video servers detected: No known video server names detected in source string literals."
    ],
    "errors": []
  },
  "capabilities": {
    "sourceKind": "anime",
    "supportsLatest": true,
    "supportsSearch": true,
    "supportsFilters": false,
    "supportsEpisodes": true,
    "supportsVideos": true,
    "supportsSubtitles": true,
    "supportsAudioTracks": true
  },
  "source": {
    "baseUrl": "The server address",
    "lang": "all",
    "headers": {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    },
    "rateLimitPerSecond": 0
  },
  "browse": {
    "popular": {
      "method": "GET",
      "url": "https://example.org/popular?page={page}",
      "headers": {},
      "parse": {
        "itemSelector": "div.flw-item",
        "title": ".dynamic-name",
        "url": "a",
        "thumbnail": "img",
        "urlResolution": "href",
        "thumbnailAttr": "data-src",
        "extras": {}
      },
      "paginated": true
    },
    "search": {
      "method": "GET",
      "url": "https://example.org/search?q={query}&page={page}",
      "headers": {},
      "parse": {
        "itemSelector": "div.flw-item",
        "title": ".dynamic-name",
        "url": "a",
        "thumbnail": "img",
        "urlResolution": "href",
        "thumbnailAttr": "data-src",
        "extras": {}
      },
      "paginated": true
    }
  },
  "filters": [],
  "details": {
    "title": "h1.title",
    "description": ".description",
    "thumbnail": "img.cover",
    "author": "",
    "artist": "",
    "genre": ".genres",
    "status": ".status",
    "statusMapping": {
      "ongoing":   ["ongoing", "emission", "en cours"],
      "completed": ["completed", "finish", "termine"],
      "canceled":  ["canceled", "cancelled"],
      "onHiatus":  ["hiatus", "on hold"]
    },
    "extras": {}
  },
  "episodes": {
    "method": "GET",
    "url": "{animeUrl}/episodes",
    "headers": {},
    "parse": {
      "itemSelector": ".episodes a",
      "number": ".ep-num",
      "name": ".ep-name",
      "url": "a",
      "scanlator": "",
      "date": ".date",
      "numberExtraction": "regex",
      "numberRegex": "\\d+(?:\\.\\d+)?"
    }
  },
  "videos": {
    "method": "GET",
    "url": "{episodeUrl}",
    "headers": {},
    "servers": [
      {
        "name": "Vidstream",
        "selector": "iframe[src*=\"vidstream\"], a[data-server*=\"vidstream\"], li[data-video*=\"vidstream\"]",
        "extractor": "vidstream",
        "qualities": [],
        "note": "Detected by name in source string literals."
      },
      {
        "name": "Mp4upload",
        "selector": "iframe[src*=\"mp4upload\"], a[data-server*=\"mp4upload\"], li[data-video*=\"mp4upload\"]",
        "extractor": "mp4upload",
        "qualities": [],
        "note": "Detected by name in source string literals."
      }
    ],
    "resolutions": [],
    "formats": ["mp4", "m3u8"],
    "extractorStrategy": "registry",
    "detectedExtractors": ["vidstream", "mp4upload"]
  },
  "subtitles": {
    "supported": true,
    "source": "video-track",
    "formats": ["vtt", "srt"],
    "note": "Subtitle references detected in source; playground will surface any Video.subtitleTracks."
  },
  "audio": {
    "supported": true,
    "source": "video-track",
    "tracks": [],
    "note": "Audio track references detected; playground will surface any Video.audioTracks."
  },
  "rawAnalysis": {
    "decompiledPath": "work/job-1785677857561/jadx-out",
    "sourceClassFile": "work/job-1785677857561/jadx-out/sources/eu/kanade/tachiyomi/animeextension/all/jellyfin/Jellyfin.java",
    "candidateClasses": ["Jellyfin"],
    "methodOverrides": [
      "popularAnimeRequest", "popularAnimeParse",
      "latestUpdatesRequest", "latestUpdatesParse",
      "searchAnimeRequest", "searchAnimeParse",
      "animeDetailsParse",
      "episodeListRequest", "episodeListParse",
      "videoListRequest", "videoListParse"
    ],
    "stringLiterals": [
      { "method": "popularAnimeRequest", "values": ["/Users/", "/Items", "StartIndex", "Limit", "20", "Recursive", "SortBy", "SortName", "SortOrder", "Ascending"] }
    ],
    "manifestDump": {
      "packageName": "eu.kanade.tachiyomi.animeextension.all.jellyfin",
      "versionCode": 0,
      "versionName": "",
      "metaDataKeys": ["tachiyomi.animeextension.class", "tachiyomi.animeextension.nsfw"]
    },
    "resourceStrings": {},
    "analyzerNotes": [
      "Scanned 365 .java files from jadx output.",
      "Found 1 candidate source class(es): Jellyfin (AnimeHttpSource, score=13)",
      "Manifest hint '.JellyfinFactory' did not match any candidate; using top-scored Jellyfin.",
      "Detected 11 overridden methods.",
      "Extracted 0 selectors, 5 request URLs, 0 filters, 0 extractors."
    ]
  }
}
```
